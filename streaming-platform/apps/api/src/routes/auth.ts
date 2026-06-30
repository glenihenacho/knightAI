import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db, type UserRow } from '../db.js';
import {
  getUser,
  hashPassword,
  requireAuth,
  signToken,
  verifyPassword,
} from '../auth.js';
import { toPublicUser } from '../mappers.js';

const signupSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(8).max(200),
  displayName: z.string().min(2).max(40),
});

const loginSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(200),
});

const findByEmail = db.prepare<[string], UserRow>(
  'SELECT * FROM users WHERE email = ?',
);
const findByHandle = db.prepare<[string], UserRow>(
  'SELECT * FROM users WHERE handle = ?',
);
const insertUser = db.prepare(
  `INSERT INTO users (email, password_hash, handle, display_name)
   VALUES (?, ?, ?, ?)`,
);

function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 20);
  return base || 'user';
}

function uniqueHandle(seed: string): string {
  const base = slugify(seed);
  if (!findByHandle.get(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}${i}`;
    if (!findByHandle.get(candidate)) return candidate;
  }
  return `${base}_${Date.now()}`;
}

export function registerAuthRoutes(app: FastifyInstance): void {
  app.post('/api/auth/signup', async (req, reply) => {
    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    }
    const { email, password, displayName } = parsed.data;
    if (findByEmail.get(email)) {
      return reply.code(409).send({ error: 'An account with that email already exists' });
    }
    const passwordHash = await hashPassword(password);
    const handle = uniqueHandle(displayName || email.split('@')[0] || 'user');
    const info = insertUser.run(email, passwordHash, handle, displayName);
    const user = db
      .prepare<[number], UserRow>('SELECT * FROM users WHERE id = ?')
      .get(Number(info.lastInsertRowid));
    if (!user) return reply.code(500).send({ error: 'Failed to create account' });
    return reply.code(201).send({ token: signToken(user.id), user: toPublicUser(user) });
  });

  app.post('/api/auth/login', async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid input' });
    }
    const { email, password } = parsed.data;
    const user = findByEmail.get(email);
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return reply.code(401).send({ error: 'Invalid email or password' });
    }
    return reply.send({ token: signToken(user.id), user: toPublicUser(user) });
  });

  app.get('/api/auth/me', { preHandler: requireAuth }, async (req) => {
    // requireAuth guarantees currentUser is set.
    return { user: toPublicUser(req.currentUser!) };
  });

  // Lightweight "who am I, if anyone" used by the web app on load.
  app.get('/api/auth/session', async (req) => {
    const user = getUser(req);
    return { user: user ? toPublicUser(user) : null };
  });
}
