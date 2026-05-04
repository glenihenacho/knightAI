# Local development

## Prereqs

- Node 20.10+
- pnpm 9+
- Docker (for Postgres + MinIO)
- Rust toolchain (only needed if running `connector-tauri`)

## First run

```bash
cd surveillance-platform

# Spin up Postgres + MinIO (creates the `surveillance` bucket on first boot)
docker compose -f infra/docker/docker-compose.yml up -d

# Install workspace deps
pnpm install

# Apply pending migrations against the local DB
pnpm --filter @surveillance/api migrate

# Run API and dashboard concurrently
SEED_ORGANIZATION_NAME="dev-org" pnpm dev
```

The API logs the seeded organization id on first boot — copy it into the
dashboard when you create your first pairing.

API: <http://localhost:4000>
Dashboard: <http://localhost:3000>
MinIO console: <http://localhost:9001> (user: `surveillance`, password: `surveillance`)

## Connector

In a separate shell:

```bash
pnpm --filter @surveillance/connector-tauri tauri:dev
```

Then in the dashboard, generate a pairing code and paste it into the connector
window. After pairing, register a camera from the dashboard with an RTSP URL
the connector machine can reach.

## Running tests

```bash
pnpm test
```

## Resetting state

Drop the docker volumes — Postgres data and MinIO objects both live there:

```bash
docker compose -f infra/docker/docker-compose.yml down -v
```

## Configuration

The API reads from environment variables (see `apps/api/src/env.ts`). Defaults
target the local Docker stack. The ones you usually care about:

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `S3_ENDPOINT` / `S3_BUCKET` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | Snapshot storage (MinIO locally, R2 in prod) |
| `PUBLIC_BASE_URL` | What the connector should call back to |
| `MIGRATE_ON_BOOT` | If `true`, runs pending migrations on server start |
| `SEED_ORGANIZATION_NAME` | If set and no orgs exist, seeds one on first boot |
