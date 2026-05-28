# Local development

## Prereqs

- Node 20.10+
- pnpm 9+
- Docker (for Postgres + MinIO)
- Rust toolchain (only needed if running `connector-tauri`)

The connector ships FFmpeg as a Tauri sidecar binary; no system-wide install is
required. The first `pnpm --filter @surveillance/connector-tauri tauri:dev`
(or `tauri:build`) auto-fetches a static FFmpeg into
`apps/connector-tauri/src-tauri/binaries/` via `scripts/fetch-ffmpeg.mjs`.
Run it manually with `pnpm --filter @surveillance/connector-tauri fetch:ffmpeg`,
or pin a specific BtbN autobuild via `FFMPEG_BUILD_TAG=autobuild-YYYY-MM-DD-HH-MM`.

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

The API logs the seeded organization id on first boot.

API: <http://localhost:4000>
Dashboard: <http://localhost:3000>
MinIO console: <http://localhost:9001> (user: `surveillance`, password: `surveillance`)

## Logging in

The dashboard requires a magic-link login. With `RESEND_API_KEY` unset (the
default), the API logs the link to stdout instead of sending email — open the
API terminal, request a link from <http://localhost:3000/login>, and click the
URL printed in the API logs. You'll be redirected back into the dashboard with
a session cookie. The user is auto-assigned to the seeded organization.

To send real emails in dev, set `RESEND_API_KEY` and `RESEND_FROM_EMAIL`.

## Connector

In a separate shell:

```bash
pnpm --filter @surveillance/connector-tauri tauri:dev
```

In the dashboard, generate a pairing code and paste it into the connector
window. After pairing, register a camera with an RTSP URL the connector machine
can reach.

## Running tests

There are two tiers:

```bash
# Fast unit tests — pure logic only, no infrastructure required.
# Safe to run anywhere (RTSP URL parsing, token hashing/comparison, …).
pnpm test

# Full API end-to-end smoke test. Requires a running Postgres
# (DATABASE_URL) — it WIPES that database, applies migrations, boots the API
# against an in-process S3 stub, and exercises the pairing → validation →
# HLS-preview flow plus auth and cross-org isolation.
pnpm test:integration
```

Run `pnpm test:integration` against a throwaway/local database only — it drops
every table before running. The local Docker Postgres (above) is the intended
target; it picks up `DATABASE_URL` the same way the API does.

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
| `DASHBOARD_BASE_URL` | Allowed CORS origin and magic-link redirect target |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | Send real magic-link emails (otherwise logged to stdout) |
| `MAGIC_LINK_TTL_SECONDS` / `SESSION_TTL_SECONDS` | Token / session lifetimes |
| `SESSION_COOKIE_SECURE` / `SESSION_COOKIE_DOMAIN` | Cookie attributes for production |
