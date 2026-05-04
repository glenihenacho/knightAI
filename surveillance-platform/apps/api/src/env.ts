import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().url().default("postgres://surveillance:surveillance@localhost:5432/surveillance"),
  PUBLIC_BASE_URL: z.string().url().default("http://localhost:4000"),
  SNAPSHOT_BUCKET_DIR: z.string().default("./.snapshots"),
  CONNECTOR_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5_000),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(): Env {
  return EnvSchema.parse(process.env);
}
