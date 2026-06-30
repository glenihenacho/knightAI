import 'fastify';
import type { UserRow } from './db.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by the `requireAuth` preHandler. */
    currentUser?: UserRow;
  }
}
