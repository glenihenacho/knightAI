# Deployment runbook

Pilot targets:

| Component | Host | Why |
|---|---|---|
| API | Fly.io | Dockerfile-based, regional, cheap idle, easy secrets |
| Dashboard | Vercel | Next.js native, preview URLs per branch |
| Postgres | Neon | Serverless Postgres, generous free tier, branchable |
| Object storage | Cloudflare R2 | S3-compatible, no egress fees |
| Connector | Hand-installed | Customer-side; ships as a Tauri installer |

Deployment is split between **cloud-side actions** (you, in each provider's
console / CLI) and **codebase artifacts** (already in this repo: Dockerfile,
fly.toml, vercel.json). This runbook walks through each step.

---

## 0. Prerequisites

```bash
brew install flyctl                        # or curl https://fly.io/install.sh | sh
npm i -g vercel                            # if you prefer CLI; the dashboard works too
```

You'll also need a domain (e.g. `knightai.com`). The dashboard and API need to
share an apex domain so session cookies travel cross-subdomain. Without that,
auth requires SameSite=None+Secure cross-site cookies, which some browsers
restrict.

---

## 1. Neon Postgres

1. Create a project at <https://console.neon.tech>. Region: `aws-us-east-2`
   (matches Fly `iad` ~ms latency).
2. Copy the **pooled** connection string from the console (it ends in
   `-pooler`). It already contains `?sslmode=require`. The `pg` driver picks
   that up; no code change needed.
3. Save it for step 4 as `DATABASE_URL`.

Migrations run automatically on each deploy via `release_command` in
`fly.toml`. The first deploy creates `_migrations` and applies everything in
`infra/database/migrations/`.

---

## 2. Cloudflare R2

1. Create an R2 bucket at <https://dash.cloudflare.com/?to=/:account/r2>.
   Name: `surveillance-prod` (or whatever).
2. Settings → API tokens → "Create R2 API token", scoped to that bucket with
   Object Read & Write. Save the access key id + secret.
3. Note the **S3 API endpoint** for the bucket: it's
   `https://<account-id>.r2.cloudflarestorage.com`. R2 supports path-style
   addressing, so the existing `S3_FORCE_PATH_STYLE=true` is correct.

CORS — the dashboard fetches signed URLs and `<video>` tags follow them, so
add a CORS rule on the bucket allowing GET + HEAD from your dashboard origin.

---

## 3. Fly.io API

From the workspace root:

```bash
fly launch --config infra/deploy/fly.toml --no-deploy
# accept the suggested app name or override; pick the iad region
```

Set secrets (everything not in `fly.toml`'s `[env]` block):

```bash
fly secrets set \
  DATABASE_URL="postgres://...neon.tech/...?sslmode=require" \
  PUBLIC_BASE_URL="https://api.knightai.com" \
  DASHBOARD_BASE_URL="https://dashboard.knightai.com" \
  SESSION_COOKIE_DOMAIN=".knightai.com" \
  S3_ENDPOINT="https://<account-id>.r2.cloudflarestorage.com" \
  S3_REGION="auto" \
  S3_BUCKET="surveillance-prod" \
  S3_ACCESS_KEY_ID="..." \
  S3_SECRET_ACCESS_KEY="..." \
  RESEND_API_KEY="re_..." \
  RESEND_FROM_EMAIL="auth@knightai.com" \
  --config infra/deploy/fly.toml
```

Deploy:

```bash
fly deploy --config infra/deploy/fly.toml
```

`release_command` runs migrations before any new instance accepts traffic.
Health check is `GET /healthz` every 15s.

Custom domain:

```bash
fly certs add api.knightai.com --config infra/deploy/fly.toml
# then in your DNS: CNAME api -> <app>.fly.dev (or AAAA per the cert output)
```

---

## 4. Vercel dashboard

1. Vercel dashboard → New Project → Import this repo.
2. **Root Directory**: `surveillance-platform/apps/dashboard`. Vercel detects
   `pnpm-workspace.yaml` two levels up and runs `pnpm install` from the
   workspace root automatically; `vercel.json` overrides install/build to be
   explicit about that.
3. Environment variables:
   - `NEXT_PUBLIC_API_BASE_URL` = `https://api.knightai.com`
4. Deploy. Then add the custom domain `dashboard.knightai.com` in Project
   Settings → Domains.

---

## 5. DNS

A typical layout:

```
api.knightai.com         CNAME  <fly-app>.fly.dev
dashboard.knightai.com   CNAME  cname.vercel-dns.com
```

Both share the apex `knightai.com`, so `SESSION_COOKIE_DOMAIN=.knightai.com`
makes the session cookie visible to both sides.

---

## 6. Connector pairing

The connector binary (built once per platform via
`pnpm --filter @surveillance/connector-tauri tauri:build`) prompts the
operator for an API URL on first launch — they enter
`https://api.knightai.com` and a pairing code generated in the dashboard.

Connector → API is bearer-token over HTTPS; no inbound port on the customer
network is needed.

---

## 7. Smoke test

After both services are up:

```bash
curl https://api.knightai.com/healthz
# {"ok":true,...}
```

Then in a browser:

1. Hit `https://dashboard.knightai.com/login`, request a magic link.
2. The Resend email lands in your inbox; click it.
3. Generate a pairing code, paste into a connector instance.
4. Register a camera with a reachable RTSP URL.
5. Watch live — segments should appear in R2 under
   `hls/<camera_id>/<preview_id>/`, and the dashboard player flips from
   "Starting…" to "Live" within ~6–10s.

---

## Cost shape (rough, May 2026)

- **Fly.io** shared-cpu-1x 512mb @ `min_machines_running=1` ≈ $2/mo.
  `auto_stop_machines` keeps costs flat-ish under bursty load.
- **Neon** free tier covers the pilot (0.5 GB storage, 191 compute hrs/mo).
- **R2** $0.015/GB-month + $0/GB egress. A pilot of 3 customers, 24h
  recording at 2 Mbps would be ~22 GB/day per camera if we kept everything
  — but the HLS preview path has a rolling window, so actual storage is
  closer to a few hundred MB peak.
- **Vercel** free Hobby plan covers the pilot dashboard.

Total pilot run-rate: under $10/mo until customer traffic shows up.

---

## Known gaps to revisit before scaling beyond pilot

- **Tauri auto-updater.** Connector updates require re-install today. Wire
  Tauri's updater plugin before any non-hand-held distribution (also
  required to push FFmpeg CVE patches — see the sidecar plan in
  `~/.claude/plans/i-just-want-to-shiny-lampson.md`).
- **Real installer icons.** `apps/connector-tauri/src-tauri/icons/` ships
  1×1 placeholders today. `tauri build` produces installers but they look
  unbranded.
- **Third-party-licenses bundle.** Ship a `THIRD_PARTY_LICENSES.txt` with
  FFmpeg's GPL-3.0 notice and a link to BtbN's source releases inside the
  installer before external distribution.
- **Background workers.** All API work is in-request today. Anything
  longer-running (e.g. retention sweeps, batch transcodes) will need a
  separate Fly process group or a queue.
