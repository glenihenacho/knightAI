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

  // If set, run pending migrations on server boot. Useful in dev; in prod we
  // run migrate as a release step instead.
  MIGRATE_ON_BOOT: z
    .string()
    .default("true")
    .transform((v) => v === "true" || v === "1"),

  // If set and no organization rows exist, create one with this name on boot.
  // Returns the org id in the logs so you can paste it into the dashboard.
  SEED_ORGANIZATION_NAME: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(): Env {
  return EnvSchema.parse(process.env);
}
