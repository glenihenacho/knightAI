import type { FastifyInstance } from "fastify";
import {
  RequestMagicLinkRequestSchema,
  type MeResponse,
} from "@surveillance/shared";
import type { Store } from "../db/store.js";
import type { Env } from "../env.js";
import type { EmailTransport } from "../email/transport.js";
import { requireOperator } from "../auth.js";
import {
  SESSION_COOKIE_NAME,
  clearSessionCookieOptions,
  sessionCookieOptions,
} from "../cookies.js";

export function registerAuthRoutes(
  app: FastifyInstance,
  store: Store,
  env: Env,
  email: EmailTransport,
): void {
  /**
   * Request a magic link by email.
   *
   * Login-only: a link is issued only if a user already exists for the email.
   * Unknown emails get a 204 with no email sent — the response shape is
   * intentionally identical to avoid leaking who has ever logged in. New
   * users come in via the admin-issued invite flow (POST /v1/invites), not
   * through this endpoint.
   */
  app.post("/v1/auth/magic-link", async (req, reply) => {
    const body = RequestMagicLinkRequestSchema.parse(req.body);
    try {
      const user = await store.findUserByEmail(body.email);
      if (user) {
        const issued = await store.createMagicLink(body.email, env.MAGIC_LINK_TTL_SECONDS);
        const link = `${env.PUBLIC_BASE_URL}/v1/auth/verify?token=${issued.token}`;
        await email.sendMagicLink({ to: body.email, link });
      }
    } catch (err) {
      req.log.error({ err }, "magic link issuance failed");
    }
    return reply.code(204).send();
  });

  app.get("/v1/auth/verify", async (req, reply) => {
    const { token } = req.query as { token?: string };
    if (typeof token !== "string" || token.length === 0) {
      return reply.redirect(`${env.DASHBOARD_BASE_URL}/login?error=missing-token`, 302);
    }
    const consumed = await store.consumeMagicLink(token);
    if (!consumed) {
      return reply.redirect(`${env.DASHBOARD_BASE_URL}/login?error=invalid-or-expired`, 302);
    }

    // If an invite is bound to this magic_link, this is a first-time
    // provisioning event. Otherwise it's a returning login.
    const invite = await store.findInviteByMagicLinkId(consumed.magicLinkId);
    let user;
    try {
      if (invite && !invite.consumedAt) {
        user = await store.provisionUserFromInvite(invite);
      } else {
        const existing = await store.findUserByEmail(consumed.email);
        if (!existing) {
          return reply.redirect(`${env.DASHBOARD_BASE_URL}/login?error=no-account`, 302);
        }
        user = existing;
      }
    } catch (err) {
      req.log.error({ err }, "user provisioning failed during verify");
      return reply.redirect(`${env.DASHBOARD_BASE_URL}/login?error=provisioning-failed`, 302);
    }
    const session = await store.createSession(user.id, env.SESSION_TTL_SECONDS);
    reply.setCookie(SESSION_COOKIE_NAME, session.token, sessionCookieOptions(env));
    return reply.redirect(env.DASHBOARD_BASE_URL, 302);
  });

  app.get("/v1/auth/me", async (req, reply) => {
    const user = await requireOperator(req, reply, store);
    if (!user) return;
    const response: MeResponse = { user };
    return reply.send(response);
  });

  app.post("/v1/auth/logout", async (req, reply) => {
    const token = req.cookies?.[SESSION_COOKIE_NAME];
    if (token) await store.deleteSessionByToken(token);
    reply.clearCookie(SESSION_COOKIE_NAME, clearSessionCookieOptions(env));
    return reply.code(204).send();
  });
}
