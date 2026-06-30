import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from './config.js';
import { db, type UserRow } from './db.js';

const TOKEN_TTL = '30d';

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function signToken(userId: number): string {
  return jwt.sign({ sub: String(userId) }, config.jwtSecret, {
    expiresIn: TOKEN_TTL,
  });
}

export function verifyToken(token: string): number | null {
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    if (typeof payload === 'object' && payload.sub) {
      const id = Number.parseInt(String(payload.sub), 10);
      return Number.isFinite(id) ? id : null;
    }
    return null;
  } catch {
    return null;
  }
}

const findUserById = db.prepare<[number], UserRow>(
  'SELECT * FROM users WHERE id = ?',
);

function extractToken(req: FastifyRequest): string | null {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    return header.slice('Bearer '.length).trim();
  }
  // Allow token via query param (used by the chat WebSocket handshake).
  const q = (req.query as Record<string, unknown> | undefined)?.token;
  return typeof q === 'string' ? q : null;
}

/** Resolve the authenticated user from a request, or null if unauthenticated. */
export function getUser(req: FastifyRequest): UserRow | null {
  const token = extractToken(req);
  if (!token) return null;
  const userId = verifyToken(token);
  if (userId === null) return null;
  return findUserById.get(userId) ?? null;
}

/** Fastify preHandler that requires a valid user; replies 401 otherwise. */
export async function requireAuth(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const user = getUser(req);
  if (!user) {
    await reply.code(401).send({ error: 'Authentication required' });
    return;
  }
  req.currentUser = user;
}
