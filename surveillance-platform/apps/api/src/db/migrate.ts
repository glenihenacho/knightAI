import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getPool, withTx } from "./client.js";

const DEFAULT_MIGRATIONS_DIR = resolve(
  fileURLToPath(new URL("../../../../infra/database/migrations", import.meta.url)),
);

export interface MigrateOptions {
  databaseUrl: string;
  migrationsDir?: string;
  logger?: { info: (msg: string) => void };
}

export async function runMigrations(opts: MigrateOptions): Promise<void> {
  const dir = opts.migrationsDir ?? DEFAULT_MIGRATIONS_DIR;
  const pool = getPool(opts.databaseUrl);
  const log = opts.logger ?? console;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const entries = (await readdir(dir))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const applied = new Set(
    (await pool.query<{ filename: string }>("SELECT filename FROM _migrations"))
      .rows.map((r) => r.filename),
  );

  for (const filename of entries) {
    if (applied.has(filename)) continue;
    const sql = await readFile(resolve(dir, filename), "utf8");
    log.info(`applying migration ${filename}`);
    await withTx(pool, async (client) => {
      await client.query(sql);
      await client.query("INSERT INTO _migrations (filename) VALUES ($1)", [filename]);
    });
  }
}

const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMain) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }
  runMigrations({ databaseUrl: url })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
