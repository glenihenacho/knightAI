import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { DiscoverOnvifPayloadSchema, type Command } from "@surveillance/shared";
import type { Store } from "../db/store.js";
import { requireOperator } from "../auth.js";
import { requestConnectorWake } from "../connector-wake.js";

export function registerConnectorRoutes(app: FastifyInstance, store: Store): void {
  app.get("/v1/connectors", async (req, reply) => {
    const user = await requireOperator(req, reply, store);
    if (!user) return;
    return { connectors: await store.listConnectorsForOrg(user.organizationId) };
  });

  // Explicitly wake a dormant connector. A connector with no live cameras goes
  // dormant (it stops the DB-backed poll loop so Neon can suspend) and waits for
  // a wake before it accepts new commands. Most operator actions wake it
  // implicitly by queuing a command; this is the manual "bring it back" button.
  app.post("/v1/connectors/:connectorId/wake", async (req, reply) => {
    const user = await requireOperator(req, reply, store);
    if (!user) return;
    const { connectorId } = req.params as { connectorId: string };
    const connector = await store.getConnectorForOrg(connectorId, user.organizationId);
    if (!connector) return reply.code(404).send({ error: "connector not found" });
    requestConnectorWake(connectorId);
    return reply.code(202).send({ ok: true });
  });

  // Kick off an ONVIF LAN scan on a connector. Fire-and-forget: the connector
  // picks the command up on its next poll, runs WS-Discovery, and posts the
  // result back; the dashboard polls the GET below for the device list.
  app.post("/v1/connectors/:connectorId/discoveries", async (req, reply) => {
    const user = await requireOperator(req, reply, store);
    if (!user) return;
    const { connectorId } = req.params as { connectorId: string };
    const connector = await store.getConnectorForOrg(connectorId, user.organizationId);
    if (!connector) {
      // Don't distinguish "not found" from "not your org".
      return reply.code(404).send({ error: "connector not found" });
    }
    const payload = DiscoverOnvifPayloadSchema.parse(req.body ?? {});
    const command: Command = {
      id: randomUUID(),
      kind: "discover_onvif",
      issuedAt: new Date().toISOString(),
      payload,
    };
    await store.enqueueCommand(connectorId, command, null);
    return reply.code(202).send({ commandId: command.id });
  });

  // Poll a discovery scan. status is the command lifecycle
  // (queued|in_flight|done|failed); devices are present once status is done.
  app.get("/v1/connectors/:connectorId/discoveries/:commandId", async (req, reply) => {
    const user = await requireOperator(req, reply, store);
    if (!user) return;
    const { connectorId, commandId } = req.params as {
      connectorId: string;
      commandId: string;
    };
    const connector = await store.getConnectorForOrg(connectorId, user.organizationId);
    if (!connector) return reply.code(404).send({ error: "connector not found" });
    const command = await store.getCommandForOrg(commandId, user.organizationId);
    if (!command) return reply.code(404).send({ error: "discovery not found" });
    return {
      status: command.status,
      devices: command.result?.discoverOnvif?.devices ?? [],
      errorMessage: command.result?.errorMessage ?? null,
    };
  });
}
