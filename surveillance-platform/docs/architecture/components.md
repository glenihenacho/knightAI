# Component map

| Component | Location | Responsibility |
|---|---|---|
| Dashboard | `apps/dashboard` | Operator UI: pair connectors, register cameras, browse previews. |
| API | `apps/api` | Auth, command broker, snapshot ingestion, pairing lifecycle. |
| Connector (Tauri) | `apps/connector-tauri` | Runs on customer hardware; pairs, polls, validates RTSP, captures frames, uploads. |
| `@surveillance/shared` | `packages/shared` | Zod schemas + TS types for the wire protocol. Single source of truth. |
| `@surveillance/camera-core` | `packages/camera-core` | RTSP URL parsing, vendor templates, future ONVIF discovery. |
| `@surveillance/connector-sdk` | `packages/connector-sdk` | Reusable TS pieces of the connector — pairing, polling loop, upload. |
| `@surveillance/ui` | `packages/ui` | Shared React components used in dashboard and connector UI. |
| `@surveillance/config` | `packages/config` | Shared TS / lint config. |

## Why separate `connector-sdk` from `connector-tauri`?

The Tauri app is one shipping vessel; we may also want to embed the same
polling logic in headless Linux daemons or a CLI for testing. Keeping the
SDK platform-agnostic avoids forking the protocol later.
