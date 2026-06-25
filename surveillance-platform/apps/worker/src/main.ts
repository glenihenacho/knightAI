// Detection worker entrypoint. Wires: model bootstrap -> ONNX session ->
// Postgres LISTEN (segment_ready + config_changed) -> segment processor ->
// Fastify /metrics + /healthz.

import Fastify from "fastify";
import { pino } from "pino";
import { CONFIG_CHANGED_CHANNEL, segmentReadyChannel } from "@surveillance/shared";
import { loadEnv } from "./env.js";
import { WorkerDb } from "./db.js";
import { Inferencer } from "./inferencer.js";
import { PgListener } from "./listener.js";
import { createMetrics } from "./metrics.js";
import { ensureModel } from "./model_loader.js";
import { createObjectStorage } from "./s3.js";
import { SegmentProcessor } from "./segment.js";

async function main() {
  const env = loadEnv();
  const log = pino({ level: env.NODE_ENV === "production" ? "info" : "debug" });

  const s3 = createObjectStorage(env);
  const modelPath = await ensureModel(env, s3, log);
  const inferencer = await Inferencer.load(modelPath, {
    scoreThreshold: env.SCORE_THRESHOLD,
    nmsIou: env.NMS_IOU,
    executionProviders: env.ONNXRUNTIME_EXECUTION_PROVIDERS
      ? (JSON.parse(env.ONNXRUNTIME_EXECUTION_PROVIDERS) as string[])
      : undefined,
  });
  log.info({ modelPath }, "inference session ready");

  const db = new WorkerDb(env.DATABASE_URL);
  const metrics = createMetrics();
  const processor = new SegmentProcessor(env, s3, db, inferencer, metrics, log);

  const segmentChannel = segmentReadyChannel(env.WORKER_SHARD);
  const listener = new PgListener(
    env.DATABASE_URL,
    [segmentChannel, CONFIG_CHANGED_CHANNEL],
    {
      onNotification(channel, payload) {
        if (channel === segmentChannel) processor.enqueue(payload);
        else if (channel === CONFIG_CHANGED_CHANNEL) db.invalidateConfigCache();
      },
    },
    log,
    {
      activeMs: env.LISTENER_ACTIVE_RECONNECT_MS,
      idleMs: env.LISTENER_IDLE_RECONNECT_MS,
      idleAfterMs: env.LISTENER_IDLE_AFTER_MS,
    },
  );
  await listener.start();

  const app = Fastify({ logger: false });
  app.get("/metrics", async (_req, reply) => {
    reply.header("content-type", metrics.registry.contentType);
    return metrics.registry.metrics();
  });
  app.get("/healthz", async () => ({ ok: true, shard: env.WORKER_SHARD }));
  await app.listen({ port: env.METRICS_PORT, host: "0.0.0.0" });
  log.info({ port: env.METRICS_PORT, shard: env.WORKER_SHARD }, "worker up");

  const shutdown = async (signal: string) => {
    log.info({ signal }, "shutting down");
    try {
      await listener.stop();
      await app.close();
      await db.close();
      process.exit(0);
    } catch (err) {
      log.error({ err }, "error during shutdown");
      process.exit(1);
    }
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
