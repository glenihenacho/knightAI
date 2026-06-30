import type { FastifyInstance } from 'fastify';
import { PROVIDERS, isProviderId, type LiveStream, type ProviderId } from '@streaming/shared';
import { db } from '../db.js';

/** A connections row joined with its owning user. */
interface JoinedRow {
  id: number;
  provider: string;
  channel_handle: string;
  is_live: number;
  title: string | null;
  viewer_count: number | null;
  thumbnail_url: string | null;
  category: string | null;
  last_checked_at: string | null;
  u_id: number;
  u_handle: string;
  u_display_name: string;
}

const SELECT = `
  SELECT c.id, c.provider, c.channel_handle, c.is_live, c.title, c.viewer_count,
         c.thumbnail_url, c.category, c.last_checked_at,
         u.id AS u_id, u.handle AS u_handle, u.display_name AS u_display_name
    FROM connections c
    JOIN users u ON u.id = c.user_id
   WHERE c.consent = 1
`;

const selectLive = db.prepare<[], JoinedRow>(
  `${SELECT} AND c.is_live = 1 ORDER BY c.viewer_count DESC NULLS LAST, c.id DESC`,
);
const selectAll = db.prepare<[], JoinedRow>(
  `${SELECT} ORDER BY c.is_live DESC, c.viewer_count DESC NULLS LAST, c.id DESC`,
);
const selectOne = db.prepare<[number], JoinedRow>(`${SELECT} AND c.id = ?`);

function toLive(row: JoinedRow): LiveStream {
  const provider: ProviderId = isProviderId(row.provider) ? row.provider : 'twitch';
  return {
    connectionId: row.id,
    provider,
    channelHandle: row.channel_handle,
    embeddable: PROVIDERS[provider].embeddable,
    streamer: { id: row.u_id, handle: row.u_handle, displayName: row.u_display_name },
    isLive: row.is_live === 1,
    title: row.title,
    viewerCount: row.viewer_count,
    thumbnailUrl: row.thumbnail_url,
    category: row.category,
    lastCheckedAt: row.last_checked_at,
  };
}

export function registerStreamRoutes(app: FastifyInstance): void {
  app.get('/api/streams/live', async () => {
    return { streams: selectLive.all().map(toLive) };
  });

  app.get('/api/streams', async () => {
    return { streams: selectAll.all().map(toLive) };
  });

  app.get('/api/streams/:id', async (req, reply) => {
    const id = Number.parseInt((req.params as { id: string }).id, 10);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: 'Invalid id' });
    const row = selectOne.get(id);
    if (!row) return reply.code(404).send({ error: 'Stream not found' });
    return { stream: toLive(row) };
  });
}
