import type { FastifyInstance } from "fastify";
import {
  CreateInviteRequestSchema,
  type Invite,
  type ListInvitesResponse,
} from "@surveillance/shared";
import type { Store } from "../db/store.js";
import type { Env } from "../env.js";
import type { EmailTransport } from "../email/transport.js";
import { requireAdmin } from "../auth.js";

export function registerInviteRoutes(
  app: FastifyInstance,
  store: Store,
  env: Env,
  email: EmailTransport,
): void {
  /**
   * Issue an invite-bearing magic link to a target email.
   *
   * Admin-only. The invite row is bound 1:1 to a magic_links row, so the
   * existing single-use semantics in consumeMagicLink govern when the invite
   * is consumed. Strict tenant scoping: an admin can only invite into an org
   * they belong to.
   */
  app.post("/v1/invites", async (req, reply) => {
    const admin = await requireAdmin(req, reply, store);
    if (!admin) return;
    const body = CreateInviteRequestSchema.parse(req.body);
    if (body.organizationId !== admin.organizationId) {
      return reply.code(403).send({ error: "cannot invite into a different organization" });
    }
    const existing = await store.findUserByEmail(body.email);
    if (existing) {
      return reply.code(409).send({ error: "user already exists for that email" });
    }
    const issued = await store.createInvite({
      email: body.email,
      organizationId: body.organizationId,
      role: body.role,
      createdByUserId: admin.id,
      ttlSeconds: env.MAGIC_LINK_TTL_SECONDS,
    });
    const link = `${env.PUBLIC_BASE_URL}/v1/auth/verify?token=${issued.token}`;
    try {
      await email.sendMagicLink({ to: body.email, link });
    } catch (err) {
      req.log.error({ err }, "invite email send failed");
      // The invite row is created either way; admin can re-send by issuing
      // a new invite (the magic_link will expire on its own).
    }
    return reply.code(201).send(issued.invite);
  });

  app.get("/v1/invites", async (req, reply) => {
    const admin = await requireAdmin(req, reply, store);
    if (!admin) return;
    const invites = await store.listInvitesForOrg(admin.organizationId);
    const response: ListInvitesResponse = { invites };
    return response;
  });
}
