import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { loadEnv } from "./env.js";
import { runMigrations } from "./db/migrate.js";
import { createStore } from "./db/store.js";
import { createObjectStorage } from "./storage/s3.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerPairingRoutes } from "./routes/pairings.js";
import { registerConnectorRoutes } from "./routes/connectors.js";
import { registerCameraRoutes } from "./routes/cameras.js";
import { registerCommandRoutes } from "./routes/commands.js";
import { registerUploadRoutes } from "./routes/uploads.js";
import { registerOrganizationRoutes } from "./routes/organizations.js";

async function main() {
  const env = loadEnv();
  const app = Fastify({ logger: { level: env.NODE_ENV === "production" ? "info" : "debug" } });

  await app.register(cors, { origin: true });
  await app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024 } });

  // Snapshot uploads stream raw image bytes; bypass body parsing so the route handler can read req.raw.
  app.addContentTypeParser(
    ["image/jpeg", "image/png", "application/octet-stream"],
    (_req, _payload, done) => done(null),
  );

  if (env.MIGRATE_ON_BOOT) {
    await runMigrations({ databaseUrl: env.DATABASE_URL, logger: app.log });
  }

  const store = createStore(env.DATABASE_URL);
  const storage = createObjectStorage(env);

  if (env.SEED_ORGANIZATION_NAME) {
    const existing = await store.listOrganizations();
    if (existing.length === 0) {
      const org = await store.createOrganization(env.SEED_ORGANIZATION_NAME);
      app.log.info({ organizationId: org.id }, `seeded organization "${env.SEED_ORGANIZATION_NAME}"`);
    }
  }

  registerHealthRoutes(app);
  registerOrganizationRoutes(app, store);
  registerPairingRoutes(app, store, env);
  registerConnectorRoutes(app, store);
  registerCameraRoutes(app, store);
  registerCommandRoutes(app, store);
  registerUploadRoutes(app, store, storage);

  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  app.log.info(`api listening on :${env.PORT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
