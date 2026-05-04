import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { loadEnv } from "./env.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerPairingRoutes } from "./routes/pairings.js";
import { registerConnectorRoutes } from "./routes/connectors.js";
import { registerCameraRoutes } from "./routes/cameras.js";
import { registerCommandRoutes } from "./routes/commands.js";
import { registerUploadRoutes } from "./routes/uploads.js";

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

  registerHealthRoutes(app);
  registerPairingRoutes(app);
  registerConnectorRoutes(app);
  registerCameraRoutes(app);
  registerCommandRoutes(app);
  registerUploadRoutes(app, env);

  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  app.log.info(`api listening on :${env.PORT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
