# Deployment

This directory holds environment-specific deploy manifests. The first targets are:

- **api** — containerized Fastify server, fronted by a TLS terminator. Needs Postgres and an S3-compatible object store for snapshots.
- **dashboard** — Next.js, deployable to any Node host or Vercel.
- **connector-tauri** — distributed as a signed installer per platform; not deployed to cloud infra.

Until we pick a target (Fly.io, Render, ECS, etc.) keep configuration declarative in this folder so the runtime is swappable.
