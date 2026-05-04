# Surveillance Platform

Agentic surveillance for existing CCTV. Customers point their existing IP cameras at a local connector running on their network, and the cloud control plane handles validation, snapshots, and downstream agentic workloads without inbound firewall rules.

## Layout

```
surveillance-platform/
├── apps/
│   ├── dashboard/          Web control plane (Next.js)
│   ├── api/                Backend + command broker (Node/Fastify)
│   └── connector-tauri/    Local customer-network runtime (Tauri)
├── packages/
│   ├── shared/             Types, schemas, status contracts
│   ├── camera-core/        RTSP templates, validation, ONVIF later
│   ├── connector-sdk/      Pairing, polling, result upload
│   ├── ui/                 Shared UI components
│   └── config/             Shared tooling config
├── infra/
│   ├── database/           Migrations and seed data
│   ├── docker/             Local dev stack
│   └── deploy/             Deployment manifests
└── docs/
    ├── product/
    ├── architecture/
    └── onboarding/
```

## Pairing & validation flow

1. Dashboard creates a pairing code.
2. Tauri connector pairs with the API using that code.
3. Operator submits an RTSP URL from the dashboard.
4. API queues a `validate_rtsp` command for the paired connector.
5. Connector long-polls the command queue.
6. Connector validates the stream locally on the customer network.
7. Connector captures a snapshot frame.
8. Connector uploads the result and snapshot to the API.
9. Dashboard renders the preview.

## Getting started

```bash
pnpm install
pnpm dev
```

See `docs/onboarding/` for environment setup.
