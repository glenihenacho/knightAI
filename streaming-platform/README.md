# KnightStream

A simplistic, Twitch-style live platform that brings together **consented** live
streams from **Twitch, Kick, YouTube Live, Instagram Live, and TikTok Live** into
one discovery + watch experience.

Streamers link the platforms they broadcast on (with explicit consent), and
viewers get a single place to see who's live, watch the embedded stream, follow
channels, and chat — regardless of which platform the creator actually uses.

## Why "consented"

KnightStream never scrapes or surfaces a channel without the streamer opting in.
A channel only appears once its owner:

1. links it from their dashboard and ticks the consent checkbox, **or**
2. verifies ownership through the platform's OAuth login.

The consent flag and timestamp are stored on every connection, and discovery
queries only ever return `consent = 1` rows.

## Layout

```
streaming-platform/
├── apps/
│   ├── api/      Fastify + SQLite control plane (auth, connections, discovery, chat)
│   └── web/      Next.js (App Router) viewer + creator experience
└── packages/
    └── shared/   Types + the streaming-provider registry (embed/URL builders)
```

## How platform integration works

Each provider is described once in `packages/shared` (brand, embeddability, how
to build a player/embed/external URL) and used by both apps:

| Platform   | Live player embed        | Keyless live-status | Verified linking |
| ---------- | ------------------------ | ------------------- | ---------------- |
| Twitch     | ✅ `player.twitch.tv`    | needs API creds     | OAuth (Twitch)   |
| Kick       | ✅ `player.kick.com`     | ✅ public endpoint  | manual           |
| YouTube    | ✅ `youtube.com/embed`   | needs API key       | OAuth (Google)   |
| Instagram  | link-out (no public embed) | n/a              | manual           |
| TikTok     | link-out (no public embed) | n/a              | manual           |

A background **poller** refreshes live status on an interval:

- **Kick** is polled for free via its public channel endpoint.
- **Twitch / YouTube** are polled when API credentials are configured; otherwise
  their status is left untouched (no false "offline").
- **Instagram / TikTok** have no public live API, so their status is managed
  manually (or via demo seed data).

Embedded players work for everyone without any credentials, because they use the
platforms' public iframe players.

> **Demo mode** (`DEMO_MODE=true`, default) seeds a handful of real public
> channels marked as live so the UI is populated out of the box. The poller
> leaves demo channels untouched.

## Getting started

Requires Node ≥ 20.10 and pnpm ≥ 9.

```bash
cd streaming-platform
pnpm install

# Configure (defaults work out of the box for local dev)
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local

# Seed demo streamers (optional but recommended)
pnpm --filter @streaming/api seed

# Run API (:4000) and web (:3000) together
pnpm dev
```

Open http://localhost:3000.

Demo viewer login (after seeding): `demo@knightstream.tv` / `demo12345`.

## Enabling real integrations

All optional — set in `apps/api/.env`:

- `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET` — live status for Twitch channels.
- `YOUTUBE_API_KEY` — live status for YouTube channels.
- OAuth (verified linking): `TWITCH_OAUTH_CLIENT_ID/SECRET`,
  `GOOGLE_OAUTH_CLIENT_ID/SECRET`. Register the redirect URI
  `http://localhost:4000/api/connections/oauth/<provider>/callback`.

## API surface

| Method | Path | Description |
| ------ | ---- | ----------- |
| POST | `/api/auth/signup` · `/api/auth/login` | Account creation / login (JWT) |
| GET | `/api/auth/me` · `/api/auth/session` | Current user |
| GET | `/api/streams/live` · `/api/streams` | Discovery (live / all) |
| GET | `/api/streams/:id` | Single stream (for the watch page) |
| GET/POST/DELETE | `/api/connections` | List / link (consented) / unlink |
| GET | `/api/connections/oauth/:provider/start` · `/callback` | Verified linking |
| GET | `/api/channels/:handle` | Channel profile + their streams |
| POST/DELETE | `/api/channels/:userId/follow` | Follow / unfollow |
| GET | `/api/me/following/live` | Live streams from channels you follow |
| WS | `/api/chat/:channelUserId` | Per-channel live chat |
| GET | `/api/chat/:channelUserId/history` | Recent chat history |

## Tech

- **API:** Fastify 5, better-sqlite3 (WAL), JWT auth, bcrypt, Zod validation,
  `@fastify/websocket` for chat.
- **Web:** Next.js 15 (App Router), React 19, plain CSS (Twitch-like dark theme).
- **Monorepo:** pnpm workspaces + Turborepo.
