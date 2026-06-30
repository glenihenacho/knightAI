import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PROVIDER_IDS, isProviderId } from '@streaming/shared';
import { config } from '../config.js';
import { db, type ConnectionRow } from '../db.js';
import { requireAuth } from '../auth.js';
import { toConnection } from '../mappers.js';
import { fetchLiveStatus } from '../providers.js';
import {
  buildAuthorizeUrl,
  exchangeCode,
  getOAuthEndpoints,
  isOAuthProvider,
  signState,
  verifyState,
} from '../oauth.js';

const linkSchema = z.object({
  provider: z.enum(PROVIDER_IDS),
  channelHandle: z.string().min(1).max(120),
  // Consent must be explicitly granted — this is the core requirement.
  consent: z.literal(true),
});

const listMine = db.prepare<[number], ConnectionRow>(
  'SELECT * FROM connections WHERE user_id = ? ORDER BY created_at DESC',
);
const findById = db.prepare<[number], ConnectionRow>(
  'SELECT * FROM connections WHERE id = ?',
);
const insertConnection = db.prepare(
  `INSERT INTO connections (user_id, provider, channel_handle, consent, consented_at, verified)
   VALUES (?, ?, ?, 1, datetime('now'), ?)`,
);
const upsertVerified = db.prepare(
  `INSERT INTO connections
     (user_id, provider, channel_handle, consent, consented_at, verified,
      oauth_access_token, oauth_refresh_token)
   VALUES (?, ?, ?, 1, datetime('now'), 1, ?, ?)
   ON CONFLICT (user_id, provider, channel_handle)
   DO UPDATE SET verified = 1, consent = 1, consented_at = datetime('now'),
                 oauth_access_token = excluded.oauth_access_token,
                 oauth_refresh_token = excluded.oauth_refresh_token`,
);
const deleteOwned = db.prepare(
  'DELETE FROM connections WHERE id = ? AND user_id = ?',
);
const applyStatus = db.prepare(
  `UPDATE connections
     SET is_live = ?, title = ?, viewer_count = ?, thumbnail_url = ?,
         category = ?, last_checked_at = datetime('now')
   WHERE id = ?`,
);

async function refreshStatus(row: ConnectionRow): Promise<void> {
  if (!isProviderId(row.provider)) return;
  try {
    const status = await fetchLiveStatus(row.provider, row.channel_handle);
    if (status) {
      applyStatus.run(
        status.isLive ? 1 : 0,
        status.title,
        status.viewerCount,
        status.thumbnailUrl,
        status.category,
        row.id,
      );
    }
  } catch {
    /* best-effort */
  }
}

function webBase(): string {
  return config.corsOrigins[0] ?? 'http://localhost:3000';
}

export function registerConnectionRoutes(app: FastifyInstance): void {
  app.get('/api/connections', { preHandler: requireAuth }, async (req) => {
    const rows = listMine.all(req.currentUser!.id);
    return { connections: rows.map(toConnection) };
  });

  app.post('/api/connections', { preHandler: requireAuth }, async (req, reply) => {
    const parsed = linkSchema.safeParse(req.body);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? 'Invalid input';
      return reply.code(400).send({
        error:
          msg === 'Invalid literal value, expected true'
            ? 'You must consent to linking this account'
            : msg,
      });
    }
    const { provider, channelHandle } = parsed.data;
    const handle = channelHandle.trim().replace(/^@/, '');
    try {
      const info = insertConnection.run(req.currentUser!.id, provider, handle, 0);
      const row = findById.get(Number(info.lastInsertRowid));
      if (!row) return reply.code(500).send({ error: 'Failed to link account' });
      await refreshStatus(row);
      const fresh = findById.get(row.id)!;
      return reply.code(201).send({ connection: toConnection(fresh) });
    } catch (err) {
      if (String(err).includes('UNIQUE')) {
        return reply.code(409).send({ error: 'That channel is already linked' });
      }
      throw err;
    }
  });

  app.delete('/api/connections/:id', { preHandler: requireAuth }, async (req, reply) => {
    const id = Number.parseInt((req.params as { id: string }).id, 10);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: 'Invalid id' });
    const info = deleteOwned.run(id, req.currentUser!.id);
    if (info.changes === 0) return reply.code(404).send({ error: 'Not found' });
    return reply.code(204).send();
  });

  // --- OAuth (verified linking) --------------------------------------------

  app.get('/api/connections/oauth/:provider/start', { preHandler: requireAuth }, async (req, reply) => {
    const provider = (req.params as { provider: string }).provider;
    if (!isOAuthProvider(provider)) {
      return reply.code(400).send({
        error: 'This provider does not support OAuth linking. Use manual linking.',
      });
    }
    const ep = getOAuthEndpoints(provider);
    if (!ep) {
      return reply.code(400).send({
        error: `OAuth for ${provider} is not configured on this server. Use manual linking instead.`,
      });
    }
    const state = signState(req.currentUser!.id, provider);
    return reply.send({ authorizeUrl: buildAuthorizeUrl(provider, ep, state) });
  });

  app.get('/api/connections/oauth/:provider/callback', async (req, reply) => {
    const provider = (req.params as { provider: string }).provider;
    const query = req.query as { code?: string; state?: string; error?: string };
    const fail = (msg: string) =>
      reply.redirect(`${webBase()}/dashboard?error=${encodeURIComponent(msg)}`);

    if (query.error) return fail(query.error);
    if (!isOAuthProvider(provider)) return fail('Unsupported provider');
    const ep = getOAuthEndpoints(provider);
    if (!ep) return fail('OAuth not configured');
    if (!query.code || !query.state) return fail('Missing code/state');

    const st = verifyState(query.state);
    if (!st || st.provider !== provider) return fail('Invalid state');

    try {
      const { accessToken, refreshToken, handle } = await exchangeCode(provider, ep, query.code);
      upsertVerified.run(st.userId, ep.provider, handle, accessToken, refreshToken);
      const row = db
        .prepare<[number, string, string], ConnectionRow>(
          'SELECT * FROM connections WHERE user_id = ? AND provider = ? AND channel_handle = ?',
        )
        .get(st.userId, ep.provider, handle);
      if (row) await refreshStatus(row);
      return reply.redirect(`${webBase()}/dashboard?linked=${ep.provider}`);
    } catch (err) {
      return fail(`Linking failed: ${String(err)}`);
    }
  });
}
