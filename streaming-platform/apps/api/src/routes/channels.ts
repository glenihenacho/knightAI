import type { FastifyInstance } from 'fastify';
import { PROVIDERS, isProviderId, type LiveStream, type ProviderId } from '@streaming/shared';
import { db, type UserRow } from '../db.js';
import { getUser, requireAuth } from '../auth.js';

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

const findByHandle = db.prepare<[string], UserRow>('SELECT * FROM users WHERE handle = ?');
const findById = db.prepare<[number], UserRow>('SELECT * FROM users WHERE id = ?');
const connectionsFor = db.prepare<[number], JoinedRow>(`
  SELECT c.id, c.provider, c.channel_handle, c.is_live, c.title, c.viewer_count,
         c.thumbnail_url, c.category, c.last_checked_at,
         u.id AS u_id, u.handle AS u_handle, u.display_name AS u_display_name
    FROM connections c
    JOIN users u ON u.id = c.user_id
   WHERE c.user_id = ? AND c.consent = 1
   ORDER BY c.is_live DESC, c.viewer_count DESC NULLS LAST, c.id DESC
`);
const countFollowers = db.prepare<[number], { n: number }>(
  'SELECT COUNT(*) AS n FROM follows WHERE channel_user_id = ?',
);
const isFollowing = db.prepare<[number, number], { n: number }>(
  'SELECT COUNT(*) AS n FROM follows WHERE follower_id = ? AND channel_user_id = ?',
);
const insertFollow = db.prepare(
  'INSERT OR IGNORE INTO follows (follower_id, channel_user_id) VALUES (?, ?)',
);
const deleteFollow = db.prepare(
  'DELETE FROM follows WHERE follower_id = ? AND channel_user_id = ?',
);
const followingLive = db.prepare<[number], JoinedRow>(`
  SELECT c.id, c.provider, c.channel_handle, c.is_live, c.title, c.viewer_count,
         c.thumbnail_url, c.category, c.last_checked_at,
         u.id AS u_id, u.handle AS u_handle, u.display_name AS u_display_name
    FROM connections c
    JOIN users u ON u.id = c.user_id
    JOIN follows f ON f.channel_user_id = c.user_id
   WHERE f.follower_id = ? AND c.consent = 1 AND c.is_live = 1
   ORDER BY c.viewer_count DESC NULLS LAST, c.id DESC
`);

export function registerChannelRoutes(app: FastifyInstance): void {
  app.get('/api/channels/:handle', async (req, reply) => {
    const handle = (req.params as { handle: string }).handle;
    const user = findByHandle.get(handle);
    if (!user) return reply.code(404).send({ error: 'Channel not found' });
    const viewer = getUser(req);
    return {
      channel: {
        user: {
          id: user.id,
          handle: user.handle,
          displayName: user.display_name,
          bio: user.bio,
        },
        followerCount: countFollowers.get(user.id)?.n ?? 0,
        isFollowing: viewer
          ? (isFollowing.get(viewer.id, user.id)?.n ?? 0) > 0
          : false,
        connections: connectionsFor.all(user.id).map(toLive),
      },
    };
  });

  app.post('/api/channels/:userId/follow', { preHandler: requireAuth }, async (req, reply) => {
    const userId = Number.parseInt((req.params as { userId: string }).userId, 10);
    if (!Number.isFinite(userId) || !findById.get(userId)) {
      return reply.code(404).send({ error: 'Channel not found' });
    }
    if (userId === req.currentUser!.id) {
      return reply.code(400).send({ error: 'You cannot follow yourself' });
    }
    insertFollow.run(req.currentUser!.id, userId);
    return reply.code(204).send();
  });

  app.delete('/api/channels/:userId/follow', { preHandler: requireAuth }, async (req, reply) => {
    const userId = Number.parseInt((req.params as { userId: string }).userId, 10);
    if (!Number.isFinite(userId)) return reply.code(400).send({ error: 'Invalid id' });
    deleteFollow.run(req.currentUser!.id, userId);
    return reply.code(204).send();
  });

  app.get('/api/me/following/live', { preHandler: requireAuth }, async (req) => {
    return { streams: followingLive.all(req.currentUser!.id).map(toLive) };
  });
}
