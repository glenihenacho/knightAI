import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z
    .string()
    .url()
    .default("postgres://surveillance:surveillance@localhost:5432/surveillance"),

  // Same object store the API and connector use.
  S3_ENDPOINT: z.string().url().default("http://localhost:9000"),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().default("surveillance"),
  S3_ACCESS_KEY_ID: z.string().default("surveillance"),
  S3_SECRET_ACCESS_KEY: z.string().default("surveillance"),
  S3_FORCE_PATH_STYLE: z
    .string()
    .default("true")
    .transform((v) => v === "true" || v === "1"),

  // Which segment_ready_shard_{n} channel this worker consumes. Phase 2 runs
  // a single worker on shard 0.
  WORKER_SHARD: z.coerce.number().int().nonnegative().default(0),

  // YOLOX-nano (Apache-2.0 — YOLOv8 and friends are AGPL, unusable here).
  // Pulled from S3 at startup, cached on local disk, sha256-verified. The
  // worker refuses to start without a model — fail loud, not silently blind.
  MODEL_S3_KEY: z.string().default("models/yolox_nano.onnx"),
  MODEL_SHA256: z
    .string()
    .default("c789161ed43c8269fcd4e67c67eeeb4e80c622da2eb296a20bc6007bd18a0b7d"),
  MODEL_CACHE_PATH: z.string().default("/tmp/yolox_nano.onnx"),
  // Local file override — skips S3 entirely (dev / integration tests).
  MODEL_LOCAL_PATH: z.string().optional(),
  // JSON array passed through to ort.InferenceSession, e.g.
  // ["CUDAExecutionProvider","CPUExecutionProvider"]. CPU-only by default.
  ONNXRUNTIME_EXECUTION_PROVIDERS: z.string().optional(),

  FFMPEG_PATH: z.string().default("ffmpeg"),
  // Frames per second sampled out of each segment for inference.
  INFER_FPS: z.coerce.number().positive().default(5),
  SCORE_THRESHOLD: z.coerce.number().positive().default(0.5),
  NMS_IOU: z.coerce.number().positive().default(0.45),
  // Segments processed concurrently across cameras (per camera is always
  // serial — tracker state depends on frame order).
  MAX_CONCURRENT_SEGMENTS: z.coerce.number().int().positive().default(4),
  // A camera whose pending-segment queue exceeds this is falling behind;
  // older notifications are dropped (counted in the throttled metric).
  MAX_QUEUE_PER_CAMERA: z.coerce.number().int().positive().default(5),

  METRICS_PORT: z.coerce.number().int().positive().default(9100),

  // Reconnect cadence for the Postgres LISTEN connection. While segments are
  // flowing the connection drops should heal fast (1s). When idle, Neon
  // suspends the compute and drops the connection; reconnecting right away
  // would immediately wake it again, so back off past the suspend window. The
  // cost is detection cold-start: after idle, the first segments can wait up
  // to this long before the worker is listening again.
  LISTENER_ACTIVE_RECONNECT_MS: z.coerce.number().int().positive().default(1_000),
  LISTENER_IDLE_RECONNECT_MS: z.coerce.number().int().positive().default(300_000),
  // No NOTIFY for this long ⇒ treat the pipeline as idle (segments arrive
  // every ~2s while a camera streams, so a minute of silence is decisive).
  LISTENER_IDLE_AFTER_MS: z.coerce.number().int().positive().default(60_000),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(): Env {
  return EnvSchema.parse(process.env);
}
