# Local development

## Prereqs

- Node 20.10+
- pnpm 9+
- Docker (for Postgres + MinIO)
- Rust toolchain (only needed if running `connector-tauri`)

## First run

```bash
cd surveillance-platform

# Spin up Postgres + MinIO
docker compose -f infra/docker/docker-compose.yml up -d

# Install workspace deps
pnpm install

# Run API and dashboard concurrently
pnpm dev
```

API: <http://localhost:4000>
Dashboard: <http://localhost:3000>

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

The API uses an in-memory store at this stage — restart the API process to
start clean. Once Postgres-backed, drop the volume:

```bash
docker compose -f infra/docker/docker-compose.yml down -v
```
