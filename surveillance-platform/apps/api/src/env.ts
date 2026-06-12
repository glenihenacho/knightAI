import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z
    .string()
    .url()
    .default("postgres://surveillance:surveillance@localhost:5432/surveillance"),
  PUBLIC_BASE_URL: z.string().url().default("http://localhost:4000"),
  CONNECTOR_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5_000),

  // Object storage. Local dev defaults target the MinIO container in
  // infra/docker/docker-compose.yml; production points at Cloudflare R2 (or any S3).
  S3_ENDPOINT: z.string().url().default("http://localhost:9000"),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().default("surveillance"),
  S3_ACCESS_KEY_ID: z.string().default("surveillance"),
  S3_SECRET_ACCESS_KEY: z.string().default("surveillance"),
  // Path-style addressing required for MinIO; R2 also accepts it. Disable if
  // the target bucket needs virtual-host addressing.
  S3_FORCE_PATH_STYLE: z
    .string()
    .default("true")
    .transform((v) => v === "true" || v === "1"),
  // How long signed snapshot URLs remain valid.
  SNAPSHOT_URL_TTL_SECONDS: z.coerce.number().int().positive().default(300),

  // Server-side detection. Segment-ready NOTIFYs are routed to
  // segment_ready_shard_{cameraId hash mod WORKER_SHARDS}; Phase 2 runs one
  // worker on shard 0, so adding workers is config-only.
  WORKER_SHARDS: z.coerce.number().int().positive().default(1),
  // The supervisor that starts/stops headless detection previews. Disable in
  // tests that drive previews manually.
  DETECTION_SUPERVISOR_ENABLED: z
    .string()
    .default("true")
    .transform((v) => v === "true" || v === "1"),
  // Reconcile interval. Only tests should need to change this.
  DETECTION_TICK_MS: z.coerce.number().int().positive().default(10_000),

  // If set, run pending migrations on server boot. Useful in dev; in prod we
  // run migrate as a release step instead.
  MIGRATE_ON_BOOT: z
    .string()
    .default("true")
    .transform((v) => v === "true" || v === "1"),

  // If set and no organization rows exist, create one with this name on boot.
  // Returns the org id in the logs so you can paste it into the dashboard.
  SEED_ORGANIZATION_NAME: z.string().optional(),

  // Bootstrap admin email. Used only at the same boot moment as
  // SEED_ORGANIZATION_NAME — when the org is being created and no users
  // exist, an admin row is inserted for this address. After that, all new
  // users come in via the invite flow.
  SEED_ADMIN_EMAIL: z.string().email().optional(),

  // Operator auth (dashboard).
  // Where the dashboard is served from. Used as the redirect target after a
  // magic-link verify and as the allowed CORS origin for credentialed requests.
  DASHBOARD_BASE_URL: z.string().url().default("http://localhost:3000"),
  // Extra origins allowed to make credentialed CORS requests, comma-separated
  // (e.g. the www/apex marketing site, which serves the same /login page).
  CORS_ALLOWED_ORIGINS: z.string().optional(),
  // Resend transactional email. If RESEND_API_KEY is unset the magic link is
  // logged to stdout instead of sent — convenient for local dev and CI.
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().default("auth@localhost"),
  // Magic-link / session lifetimes.
  MAGIC_LINK_TTL_SECONDS: z.coerce.number().int().positive().default(15 * 60),
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(14 * 24 * 60 * 60),
  // Whether the session cookie is marked Secure. Defaults off for dev (http);
  // production deploys flip this on.
  SESSION_COOKIE_SECURE: z
    .string()
    .default("false")
    .transform((v) => v === "true" || v === "1"),
  // Optional Domain attribute for the session cookie (e.g. ".goldcrusade.com" so
  // both api.* and dashboard.* see it). Leave unset for localhost dev.
  SESSION_COOKIE_DOMAIN: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(): Env {
  return EnvSchema.parse(process.env);
}
