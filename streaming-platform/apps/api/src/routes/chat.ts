import type { FastifyInstance } from 'fastify';
import type { WebSocket } from '@fastify/websocket';
import {
  CHAT_MAX_LENGTH,
  type ChatMessage,
  type ChatServerMessage,
} from '@streaming/shared';
import { db, type UserRow } from '../db.js';
import { getUser } from '../auth.js';

interface ChatJoinRow {
  id: number;
  channel_user_id: number;
  body: string;
  created_at: string;
  u_id: number;
  u_handle: string;
  u_display_name: string;
}

function toMessage(row: ChatJoinRow): ChatMessage {
  return {
    id: row.id,
    channelUserId: row.channel_user_id,
    user: { id: row.u_id, handle: row.u_handle, displayName: row.u_display_name },
    body: row.body,
    createdAt: row.created_at,
  };
}

const channelExists = db.prepare<[number], { n: number }>(
  'SELECT COUNT(*) AS n FROM users WHERE id = ?',
);
const recentMessages = db.prepare<[number, number], ChatJoinRow>(`
  SELECT m.id, m.channel_user_id, m.body, m.created_at,
         u.id AS u_id, u.handle AS u_handle, u.display_name AS u_display_name
    FROM chat_messages m
    JOIN users u ON u.id = m.user_id
   WHERE m.channel_user_id = ?
   ORDER BY m.id DESC
   LIMIT ?
`);
const insertMessage = db.prepare(
  'INSERT INTO chat_messages (channel_user_id, user_id, body) VALUES (?, ?, ?)',
);
const messageById = db.prepare<[number], ChatJoinRow>(`
  SELECT m.id, m.channel_user_id, m.body, m.created_at,
         u.id AS u_id, u.handle AS u_handle, u.display_name AS u_display_name
    FROM chat_messages m
    JOIN users u ON u.id = m.user_id
   WHERE m.id = ?
`);

const WS_OPEN = 1;

/** channelUserId -> set of connected sockets. */
const rooms = new Map<number, Set<WebSocket>>();

function room(channelUserId: number): Set<WebSocket> {
  let set = rooms.get(channelUserId);
  if (!set) {
    set = new Set();
    rooms.set(channelUserId, set);
  }
  return set;
}

function broadcast(channelUserId: number, msg: ChatServerMessage): void {
  const payload = JSON.stringify(msg);
  for (const sock of room(channelUserId)) {
    if (sock.readyState === WS_OPEN) sock.send(payload);
  }
}

function send(sock: WebSocket, msg: ChatServerMessage): void {
  if (sock.readyState === WS_OPEN) sock.send(JSON.stringify(msg));
}

export function registerChatRoutes(app: FastifyInstance): void {
  app.get('/api/chat/:channelUserId/history', async (req, reply) => {
    const channelUserId = Number.parseInt(
      (req.params as { channelUserId: string }).channelUserId,
      10,
    );
    if (!Number.isFinite(channelUserId)) {
      return reply.code(400).send({ error: 'Invalid channel' });
    }
    const rows = recentMessages.all(channelUserId, 50).reverse();
    return { messages: rows.map(toMessage) };
  });

  app.get('/api/chat/:channelUserId', { websocket: true }, (socket: WebSocket, req) => {
    const channelUserId = Number.parseInt(
      (req.params as { channelUserId: string }).channelUserId,
      10,
    );
    if (!Number.isFinite(channelUserId) || (channelExists.get(channelUserId)?.n ?? 0) === 0) {
      send(socket, { type: 'error', error: 'Channel not found' });
      socket.close();
      return;
    }

    const user: UserRow | null = getUser(req);
    const set = room(channelUserId);
    set.add(socket);

    // Send history + presence on join.
    const history = recentMessages.all(channelUserId, 50).reverse().map(toMessage);
    send(socket, { type: 'history', messages: history });
    broadcast(channelUserId, { type: 'presence', viewers: set.size });

    socket.on('message', (raw: unknown) => {
      if (!user) {
        send(socket, { type: 'error', error: 'Sign in to chat' });
        return;
      }
      let body: string;
      try {
        const parsed = JSON.parse(String(raw)) as { type?: string; body?: unknown };
        if (parsed.type !== 'send' || typeof parsed.body !== 'string') return;
        body = parsed.body.trim();
      } catch {
        return;
      }
      if (!body) return;
      if (body.length > CHAT_MAX_LENGTH) body = body.slice(0, CHAT_MAX_LENGTH);

      const info = insertMessage.run(channelUserId, user.id, body);
      const row = messageById.get(Number(info.lastInsertRowid));
      if (row) broadcast(channelUserId, { type: 'message', message: toMessage(row) });
    });

    socket.on('close', () => {
      set.delete(socket);
      broadcast(channelUserId, { type: 'presence', viewers: set.size });
    });
  });
}
