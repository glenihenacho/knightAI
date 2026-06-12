/**
 * End-to-end smoke test for the API. Covers M1 (Postgres + S3 + connector
 * pairing) and M2 (magic-link operator auth + org-scoped routes).
 *
 * Runs against:
 *   - real Postgres (DATABASE_URL must point at a fresh DB; this script wipes it)
 *   - in-process S3 stub on port 19000
 *
 * Resend isn't configured, so the magic link prints to stdout via the dev
 * fallback transport. The test buffers the API child's stdout and extracts
 * the token from the log line.
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { setTimeout as sleep } from "node:timers/promises";
import { Client } from "pg";

const API_PORT = 14099;
const S3_PORT = 19000;
const DASHBOARD_BASE_URL = "http://127.0.0.1:13000";
const SEED_ORG_NAME = "Acme";
const OPERATOR_EMAIL = "operator@example.com";
const CLIENT_EMAIL = "client@example.com";
const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://surveillance:surveillance@127.0.0.1:5432/surveillance";

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  const marker = ok ? "PASS" : "FAIL";
  console.log(`[${marker}] ${label}${detail !== undefined ? ` :: ${JSON.stringify(detail)}` : ""}`);
  if (!ok) failures += 1;
}

async function wipeDb() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  await client.query(`
    DROP TABLE IF EXISTS rules CASCADE;
    DROP TABLE IF EXISTS schedules CASCADE;
    DROP TABLE IF EXISTS zones CASCADE;
    DROP TABLE IF EXISTS invites CASCADE;
    DROP TABLE IF EXISTS sessions CASCADE;
    DROP TABLE IF EXISTS magic_links CASCADE;
    DROP TABLE IF EXISTS users CASCADE;
    DROP TABLE IF EXISTS commands CASCADE;
    DROP TABLE IF EXISTS cameras CASCADE;
    DROP TABLE IF EXISTS previews CASCADE;
    DROP TABLE IF EXISTS connectors CASCADE;
    DROP TABLE IF EXISTS pairings CASCADE;
    DROP TABLE IF EXISTS sites CASCADE;
    DROP TABLE IF EXISTS organizations CASCADE;
    DROP TABLE IF EXISTS _migrations CASCADE;
    DROP TYPE IF EXISTS connector_status CASCADE;
    DROP TYPE IF EXISTS connector_platform CASCADE;
    DROP TYPE IF EXISTS camera_state CASCADE;
    DROP TYPE IF EXISTS command_status CASCADE;
    DROP TYPE IF EXISTS command_kind CASCADE;
  `);
  await client.end();
}

interface StubObject {
  body: Buffer;
  contentType: string;
}

interface S3Stub {
  putCount: number;
  /** Keyed by S3 object key (path-style: /<bucket>/<key>). */
  objects: Map<string, StubObject>;
  /** Last PUT key, for tests that just want "where did the last upload land". */
  lastKey: string | null;
  /** Last PUT body, retained for compatibility with the snapshot path. */
  lastBody: Buffer | null;
  close(): Promise<void>;
}

function pathOnly(url: string | undefined): string {
  return (url ?? "").split("?")[0] ?? "";
}

function startS3Stub(): Promise<S3Stub> {
  return new Promise((resolve) => {
    const stub: S3Stub = {
      putCount: 0,
      objects: new Map(),
      lastKey: null,
      lastBody: null,
      close: () => new Promise((res) => server.close(() => res())),
    };
    const server = createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const body = Buffer.concat(chunks);
      const key = pathOnly(req.url);
      if (req.method === "PUT") {
        stub.putCount += 1;
        stub.lastKey = req.url ?? null;
        stub.lastBody = body;
        stub.objects.set(key, {
          body,
          contentType:
            (req.headers["content-type"] as string | undefined) ?? "application/octet-stream",
        });
        res.writeHead(200, { ETag: '"deadbeef"' });
        res.end();
        return;
      }
      if (req.method === "GET") {
        const obj = stub.objects.get(key);
        if (!obj) {
          res.writeHead(404);
          res.end();
          return;
        }
        res.writeHead(200, {
          "content-type": obj.contentType,
          "content-length": String(obj.body.length),
        });
        res.end(obj.body);
        return;
      }
      res.writeHead(405);
      res.end();
    });
    server.listen(S3_PORT, () => resolve(stub));
  });
}

interface ApiHandle {
  stop(): Promise<void>;
  /** All bytes the API has written to stdout/stderr since start. */
  stdoutBuffer: string[];
}

async function startApi(): Promise<ApiHandle> {
  const tsxBin = new URL("../node_modules/.bin/tsx", import.meta.url).pathname;
  const serverEntry = new URL("../src/server.ts", import.meta.url).pathname;
  const buffer: string[] = [];
  const child = spawn(tsxBin, [serverEntry], {
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(API_PORT),
      DATABASE_URL,
      PUBLIC_BASE_URL: `http://127.0.0.1:${API_PORT}`,
      DASHBOARD_BASE_URL,
      MIGRATE_ON_BOOT: "true",
      SEED_ORGANIZATION_NAME: SEED_ORG_NAME,
      SEED_ADMIN_EMAIL: OPERATOR_EMAIL,
      S3_ENDPOINT: `http://127.0.0.1:${S3_PORT}`,
      S3_REGION: "us-east-1",
      S3_BUCKET: "surveillance",
      S3_ACCESS_KEY_ID: "test",
      S3_SECRET_ACCESS_KEY: "test",
      S3_FORCE_PATH_STYLE: "true",
      SNAPSHOT_URL_TTL_SECONDS: "120",
      MAGIC_LINK_TTL_SECONDS: "60",
      SESSION_TTL_SECONDS: "3600",
      SESSION_COOKIE_SECURE: "false",
      RESEND_API_KEY: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (b) => {
    const str = String(b);
    buffer.push(str);
    process.stderr.write(`[api] ${str}`);
  });
  child.stderr.on("data", (b) => {
    const str = String(b);
    buffer.push(str);
    process.stderr.write(`[api!] ${str}`);
  });

  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${API_PORT}/healthz`);
      if (r.ok) break;
    } catch {
      // keep waiting
    }
    await sleep(200);
  }
  return {
    stdoutBuffer: buffer,
    stop: () =>
      new Promise((resolve) => {
        child.once("exit", () => resolve());
        child.kill("SIGTERM");
      }),
  };
}

function extractMagicLink(buffer: string[]): string | null {
  return extractAllMagicLinks(buffer)[0] ?? null;
}

function extractAllMagicLinks(buffer: string[]): string[] {
  // Dev transport logs a Pino line containing "link":"http://.../verify?token=..."
  const joined = buffer.join("");
  const matches = joined.matchAll(/"link":"(http[^"]+\/v1\/auth\/verify\?token=[^"]+)"/g);
  return Array.from(matches, (m) => m[1]!);
}

function extractLatestMagicLink(buffer: string[]): string | null {
  const all = extractAllMagicLinks(buffer);
  return all.length > 0 ? all[all.length - 1]! : null;
}

function parseSessionCookie(setCookie: string | null): string | null {
  if (!setCookie) return null;
  const match = setCookie.match(/surv_sess=([^;]+)/);
  return match?.[1] ?? null;
}

const API = `http://127.0.0.1:${API_PORT}`;

async function main() {
  await wipeDb();
  const s3 = await startS3Stub();
  const api = await startApi();

  try {
    // ===== M2: protected routes reject anonymous access =====
    const blockedPairings = await fetch(`${API}/v1/pairings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    check("POST /v1/pairings without session 401", blockedPairings.status === 401);

    const blockedCameras = await fetch(`${API}/v1/cameras`);
    check("GET /v1/cameras without session 401", blockedCameras.status === 401);

    const blockedConnectors = await fetch(`${API}/v1/connectors`);
    check("GET /v1/connectors without session 401", blockedConnectors.status === 401);

    const blockedMe = await fetch(`${API}/v1/auth/me`);
    check("GET /v1/auth/me without session 401", blockedMe.status === 401);

    // ===== Magic-link login =====
    const reqLinkRes = await fetch(`${API}/v1/auth/magic-link`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: OPERATOR_EMAIL }),
    });
    check("POST /v1/auth/magic-link 204", reqLinkRes.status === 204);

    await sleep(50);
    const link = extractMagicLink(api.stdoutBuffer);
    check("magic link logged to stdout", typeof link === "string" && link.startsWith(API), link);
    if (!link) throw new Error("magic link missing — cannot continue");

    // Verify with bogus token redirects with error param.
    const wrongVerify = await fetch(`${API}/v1/auth/verify?token=invalid`, {
      redirect: "manual",
    });
    check(
      "verify with bogus token redirects to /login?error=...",
      wrongVerify.status === 302 && (wrongVerify.headers.get("location") ?? "").includes("error="),
    );

    // Verify with the real token: 302 to dashboard with Set-Cookie.
    const verifyRes = await fetch(link, { redirect: "manual" });
    check("verify with real token 302", verifyRes.status === 302);
    check(
      "verify lands on /dashboard",
      verifyRes.headers.get("location") === `${DASHBOARD_BASE_URL}/dashboard`,
    );
    const sessionCookie = parseSessionCookie(verifyRes.headers.get("set-cookie"));
    check("Set-Cookie contains surv_sess", typeof sessionCookie === "string" && sessionCookie.length > 0);
    if (!sessionCookie) throw new Error("session cookie missing");
    const cookieHeader = `surv_sess=${sessionCookie}`;

    // Replay the consumed link → error redirect.
    const replayLinkRes = await fetch(link, { redirect: "manual" });
    const replayLoc = replayLinkRes.headers.get("location") ?? "";
    check(
      "magic link replay redirects with error",
      replayLinkRes.status === 302 && replayLoc.includes("error="),
    );

    // /me with cookie returns user.
    const meRes = await fetch(`${API}/v1/auth/me`, { headers: { cookie: cookieHeader } });
    check("GET /v1/auth/me 200", meRes.status === 200);
    const me = await meRes.json();
    check("me returns email", me.user.email === OPERATOR_EMAIL);
    check("me returns organizationId", typeof me.user.organizationId === "string");
    check("seeded operator has admin role", me.user.role === "admin");
    const orgId = me.user.organizationId;

    // GET /v1/organizations returns just the operator's org.
    const orgsRes = await fetch(`${API}/v1/organizations`, { headers: { cookie: cookieHeader } });
    const orgs = await orgsRes.json();
    check("orgs list has exactly one entry", orgs.organizations.length === 1);
    check("orgs entry matches user", orgs.organizations[0]?.id === orgId);

    // ===== Public magic-link is login-only — unknown emails get no link =====
    const stranger = await fetch(`${API}/v1/auth/magic-link`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "stranger@example.com" }),
    });
    check("magic-link request for unknown email 204", stranger.status === 204);
    await sleep(50);
    const linksAfterStranger = extractAllMagicLinks(api.stdoutBuffer);
    check(
      "no link issued for unknown email",
      linksAfterStranger.length === 1, // still just the operator's
      linksAfterStranger.length,
    );

    // ===== Admin invites a client =====
    const inviteRes = await fetch(`${API}/v1/invites`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieHeader },
      body: JSON.stringify({
        email: CLIENT_EMAIL,
        organizationId: orgId,
        role: "client",
      }),
    });
    check("POST /v1/invites 201", inviteRes.status === 201);
    const invite = await inviteRes.json();
    check("invite email matches", invite.email === CLIENT_EMAIL);
    check("invite role is client", invite.role === "client");
    check("invite consumed_at is null", invite.consumedAt === null);

    // Cross-org guard: inviting into someone else's org is 403.
    const otherOrgInvite = await fetch(`${API}/v1/invites`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieHeader },
      body: JSON.stringify({
        email: "noone@example.com",
        organizationId: "00000000-0000-0000-0000-000000000000",
        role: "client",
      }),
    });
    check("invite into different org 403", otherOrgInvite.status === 403);

    // Client follows the invite link.
    await sleep(50);
    const inviteLink = extractLatestMagicLink(api.stdoutBuffer);
    check("invite link logged", typeof inviteLink === "string", inviteLink);
    if (!inviteLink) throw new Error("invite link missing");

    const inviteVerifyRes = await fetch(inviteLink, { redirect: "manual" });
    check("invite verify 302", inviteVerifyRes.status === 302);
    check(
      "invite verify lands on /dashboard",
      inviteVerifyRes.headers.get("location") === `${DASHBOARD_BASE_URL}/dashboard`,
    );
    const clientCookie = parseSessionCookie(inviteVerifyRes.headers.get("set-cookie"));
    check("invite verify sets session cookie", typeof clientCookie === "string");
    if (!clientCookie) throw new Error("client cookie missing");

    // Client /me reflects role + same org.
    const clientMeRes = await fetch(`${API}/v1/auth/me`, {
      headers: { cookie: `surv_sess=${clientCookie}` },
    });
    const clientMe = await clientMeRes.json();
    check("client me returns email", clientMe.user.email === CLIENT_EMAIL);
    check("client me has role 'client'", clientMe.user.role === "client");
    check("client me uses inviting org", clientMe.user.organizationId === orgId);

    // Clients are blocked from POST /v1/invites (admin-only).
    const clientInviteAttempt = await fetch(`${API}/v1/invites`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: `surv_sess=${clientCookie}` },
      body: JSON.stringify({
        email: "another@example.com",
        organizationId: orgId,
        role: "client",
      }),
    });
    check("client POST /v1/invites 403", clientInviteAttempt.status === 403);

    // …but clients still have operator privileges (pairing, cameras, connectors).
    const clientConnectorsRes = await fetch(`${API}/v1/connectors`, {
      headers: { cookie: `surv_sess=${clientCookie}` },
    });
    check("client GET /v1/connectors 200", clientConnectorsRes.status === 200);
    const clientPairingRes = await fetch(`${API}/v1/pairings`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: `surv_sess=${clientCookie}` },
      body: JSON.stringify({}),
    });
    check("client POST /v1/pairings 201", clientPairingRes.status === 201);

    // Admin lists invites — sees the consumed one.
    const listInvitesRes = await fetch(`${API}/v1/invites`, {
      headers: { cookie: cookieHeader },
    });
    const listInvites = await listInvitesRes.json();
    check(
      "admin lists invite",
      listInvites.invites.length === 1 && listInvites.invites[0].email === CLIENT_EMAIL,
    );
    check(
      "listed invite shows consumed",
      typeof listInvites.invites[0].consumedAt === "string",
    );

    // ===== M1 flow over an authenticated session =====
    // Create pairing — body no longer carries organizationId.
    const pairRes = await fetch(`${API}/v1/pairings`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieHeader },
      body: JSON.stringify({}),
    });
    check("POST /v1/pairings 201", pairRes.status === 201);
    const pairing = await pairRes.json();
    check("pairing code matches XXXX-XXXX", /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(pairing.code));

    // Connector redeems (no auth header — pairing code is the credential).
    const redeemRes = await fetch(`${API}/v1/pairings/redeem`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code: pairing.code,
        hostname: "test-box",
        platform: "linux",
        version: "0.1.0",
      }),
    });
    check("redeem pairing 200", redeemRes.status === 200);
    const redeemed = await redeemRes.json();
    const auth = {
      authorization: `Bearer ${redeemed.connectorToken}`,
      "x-connector-id": redeemed.connectorId,
    };

    // Operator lists connectors — should see the new one.
    const listRes = await fetch(`${API}/v1/connectors`, { headers: { cookie: cookieHeader } });
    const list = await listRes.json();
    check(
      "connector list contains the redeemed one",
      list.connectors.some((c: { id: string }) => c.id === redeemed.connectorId),
    );

    // Camera POST.
    const camRes = await fetch(`${API}/v1/cameras`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieHeader },
      body: JSON.stringify({
        connectorId: redeemed.connectorId,
        label: "Front door",
        rtspUrl: "rtsp://example.com:554/stream",
      }),
    });
    check("create camera 201", camRes.status === 201);
    const { camera, queuedCommandId } = await camRes.json();

    // Connector polls.
    const cmdRes = await fetch(`${API}/v1/connectors/commands/next`, { headers: auth });
    check("connector poll returns queued command", cmdRes.status === 200);
    const cmd = await cmdRes.json();
    check(
      "queued command is the validate_rtsp",
      cmd.id === queuedCommandId && cmd.kind === "validate_rtsp",
    );

    // Snapshot upload + result submission.
    const fakeJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0]);
    const uploadKey = "snap-12345";
    const upRes = await fetch(`${API}/v1/connectors/uploads/${uploadKey}`, {
      method: "PUT",
      headers: { ...auth, "content-type": "image/jpeg" },
      body: fakeJpeg,
    });
    check("connector upload 204", upRes.status === 204);
    check("S3 stub got upload", s3.putCount === 1 && s3.lastBody?.equals(fakeJpeg) === true);

    const resultRes = await fetch(`${API}/v1/connectors/commands/${cmd.id}/result`, {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({
        commandId: cmd.id,
        status: "ok",
        durationMs: 1234,
        finishedAt: new Date().toISOString(),
        validateRtsp: { reachable: true, snapshotUploadKey: uploadKey },
      }),
    });
    check("submit result 204", resultRes.status === 204);

    // Operator sees camera state online.
    const camsRes = await fetch(`${API}/v1/cameras`, { headers: { cookie: cookieHeader } });
    const cams = await camsRes.json();
    const updated = cams.cameras.find((c: { id: string }) => c.id === camera.id);
    check(
      "camera online after validation",
      updated?.state === "online" && updated?.lastSnapshotKey === uploadKey,
    );

    // Snapshot URL endpoint redirects to signed URL (still public per design).
    const snapRes = await fetch(`${API}/v1/snapshots/${uploadKey}`, { redirect: "manual" });
    check("snapshot redirect 302", snapRes.status === 302);
    const snapLoc = snapRes.headers.get("location") ?? "";
    check("signed URL has X-Amz-Signature", snapLoc.includes("X-Amz-Signature="));

    // ===== M3: HLS preview pipeline =====
    // Start a preview session on the just-validated camera.
    const startPrev1 = await fetch(`${API}/v1/cameras/${camera.id}/preview`, {
      method: "POST",
      headers: { cookie: cookieHeader },
    });
    check("POST preview start 201", startPrev1.status === 201);
    const prev1 = await startPrev1.json();
    check("preview returned with id and manifestUrl",
      typeof prev1.preview?.id === "string" && typeof prev1.manifestUrl === "string");
    check("preview status starts as 'starting'", prev1.preview.status === "starting");

    // Idempotent re-call returns the same session.
    const startPrev2 = await fetch(`${API}/v1/cameras/${camera.id}/preview`, {
      method: "POST",
      headers: { cookie: cookieHeader },
    });
    const prev2 = await startPrev2.json();
    check("second start returns same preview id", prev2.preview.id === prev1.preview.id);

    // Manifest 404 before any upload.
    const earlyManifest = await fetch(prev1.manifestUrl);
    check("manifest 404 before connector upload", earlyManifest.status === 404);

    // Connector should now see a start_preview command.
    const startCmdRes = await fetch(`${API}/v1/connectors/commands/next`, { headers: auth });
    check("connector poll returns start_preview", startCmdRes.status === 200);
    const startCmd = await startCmdRes.json();
    check("command kind is start_preview", startCmd.kind === "start_preview");
    check("payload has previewId matching", startCmd.payload.previewId === prev1.preview.id);
    check("payload has rtspUrl + maxDurationSeconds + segmentSeconds + windowSegments",
      typeof startCmd.payload.rtspUrl === "string"
        && typeof startCmd.payload.maxDurationSeconds === "number"
        && typeof startCmd.payload.segmentSeconds === "number"
        && typeof startCmd.payload.windowSegments === "number");

    // Cross-connector HLS upload is rejected (foreign connector trying to push to this preview).
    const fakeManifest =
      "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:2\n#EXTINF:2.0,\nseg-0001.ts\n#EXTINF:2.0,\nseg-0002.ts\n";
    // (no second connector in this test; just upload a manifest from the legit connector).
    const manifestUpRes = await fetch(
      `${API}/v1/connectors/hls/${prev1.preview.id}/playlist.m3u8`,
      {
        method: "PUT",
        headers: { ...auth, "content-type": "application/vnd.apple.mpegurl" },
        body: fakeManifest,
      },
    );
    check("connector PUTs manifest 204", manifestUpRes.status === 204);
    check("S3 stub got manifest under hls/<camera>/<preview>/", s3.lastKey?.includes(`/hls/${camera.id}/${prev1.preview.id}/playlist.m3u8`) === true, s3.lastKey);

    // Now segments.
    const fakeSegment = Buffer.alloc(256, 0xab);
    const seg1Res = await fetch(
      `${API}/v1/connectors/hls/${prev1.preview.id}/seg-0001.ts`,
      {
        method: "PUT",
        headers: { ...auth, "content-type": "video/mp2t" },
        body: fakeSegment,
      },
    );
    check("connector PUTs segment 204", seg1Res.status === 204);
    const seg2Res = await fetch(
      `${API}/v1/connectors/hls/${prev1.preview.id}/seg-0002.ts`,
      {
        method: "PUT",
        headers: { ...auth, "content-type": "video/mp2t" },
        body: fakeSegment,
      },
    );
    check("connector PUTs second segment 204", seg2Res.status === 204);

    // Filename validation: no traversal, no unexpected names.
    const badFilenameRes = await fetch(
      `${API}/v1/connectors/hls/${prev1.preview.id}/..%2Fevil`,
      { method: "PUT", headers: { ...auth, "content-type": "video/mp2t" }, body: fakeSegment },
    );
    check("HLS upload rejects path-traversal filename", badFilenameRes.status === 400);

    // Manifest now serves with rewritten segment URLs.
    const manifestRes = await fetch(prev1.manifestUrl);
    check("manifest 200 after upload", manifestRes.status === 200);
    check(
      "manifest content-type is mpegurl",
      manifestRes.headers.get("content-type")?.includes("application/vnd.apple.mpegurl") === true,
    );
    const manifestBody = await manifestRes.text();
    check("manifest preserves #EXTM3U header", manifestBody.startsWith("#EXTM3U"));
    check(
      "manifest rewrites seg-0001.ts to API path",
      manifestBody.includes(`/v1/previews/${prev1.preview.id}/seg/seg-0001.ts`),
    );
    check(
      "manifest rewrites seg-0002.ts too",
      manifestBody.includes(`/v1/previews/${prev1.preview.id}/seg/seg-0002.ts`),
    );

    // Segment proxy serves the bytes back.
    const segGetRes = await fetch(`${API}/v1/previews/${prev1.preview.id}/seg/seg-0001.ts`);
    check("segment GET 200", segGetRes.status === 200);
    check(
      "segment content-type is mp2t",
      (segGetRes.headers.get("content-type") ?? "").includes("video/mp2t"),
    );
    const segBytes = Buffer.from(await segGetRes.arrayBuffer());
    check("segment bytes match upload", segBytes.equals(fakeSegment));

    // Heartbeat works while the session is live.
    const hb1 = await fetch(`${API}/v1/previews/${prev1.preview.id}/heartbeat`, {
      method: "POST",
      headers: { cookie: cookieHeader },
    });
    check("heartbeat 204", hb1.status === 204);

    // Connector submits the start_preview command result.
    await fetch(`${API}/v1/connectors/commands/${startCmd.id}/result`, {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({
        commandId: startCmd.id,
        status: "ok",
        durationMs: 50,
        finishedAt: new Date().toISOString(),
        startPreview: { startedAt: new Date().toISOString() },
      }),
    });

    // Operator stops the preview.
    const stopRes = await fetch(`${API}/v1/cameras/${camera.id}/preview`, {
      method: "DELETE",
      headers: { cookie: cookieHeader },
    });
    check("DELETE preview 204", stopRes.status === 204);

    // Connector should now see a stop_preview command for the same preview.
    const stopCmdRes = await fetch(`${API}/v1/connectors/commands/next`, { headers: auth });
    check("connector poll returns stop_preview", stopCmdRes.status === 200);
    const stopCmd = await stopCmdRes.json();
    check("stop_preview targets the right previewId",
      stopCmd.kind === "stop_preview" && stopCmd.payload.previewId === prev1.preview.id);

    // Heartbeat after end → 409.
    const hb2 = await fetch(`${API}/v1/previews/${prev1.preview.id}/heartbeat`, {
      method: "POST",
      headers: { cookie: cookieHeader },
    });
    check("heartbeat after end 409", hb2.status === 409);

    // ===== M3: start_preview failure path =====
    const startPrevFail = await fetch(`${API}/v1/cameras/${camera.id}/preview`, {
      method: "POST",
      headers: { cookie: cookieHeader },
    });
    check("second preview start 201 (after first ended)", startPrevFail.status === 201);
    const prevFail = await startPrevFail.json();

    // Connector pulls + submits failure
    const failCmdRes = await fetch(`${API}/v1/connectors/commands/next`, { headers: auth });
    const failCmd = await failCmdRes.json();
    await fetch(`${API}/v1/connectors/commands/${failCmd.id}/result`, {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({
        commandId: failCmd.id,
        status: "failed",
        durationMs: 10,
        finishedAt: new Date().toISOString(),
        errorMessage: "ffmpeg not found",
      }),
    });
    // Preview should now be ended with status=failed.
    const sql2 = new Client({ connectionString: DATABASE_URL });
    await sql2.connect();
    const failRow = await sql2.query<{ status: string; ended_at: Date | null; error_message: string | null }>(
      "SELECT status, ended_at, error_message FROM previews WHERE id = $1",
      [prevFail.preview.id],
    );
    await sql2.end();
    check("failed preview marked status=failed", failRow.rows[0]?.status === "failed");
    check("failed preview has ended_at set", failRow.rows[0]?.ended_at !== null);
    check("failed preview captured error message", failRow.rows[0]?.error_message === "ffmpeg not found");

    // ===== Cross-org isolation =====
    // Insert a foreign org + connector via SQL, then confirm the operator's
    // session does not see it through the org-scoped list endpoints.
    const sql = new Client({ connectionString: DATABASE_URL });
    await sql.connect();
    const otherOrg = await sql.query<{ id: string }>(
      "INSERT INTO organizations (name) VALUES ('Other Co') RETURNING id",
    );
    const otherOrgId = otherOrg.rows[0]!.id;
    const otherSite = await sql.query<{ id: string }>(
      "INSERT INTO sites (organization_id, label) VALUES ($1, 'Default site') RETURNING id",
      [otherOrgId],
    );
    await sql.query(
      `INSERT INTO connectors (organization_id, site_id, label, hostname, platform, version, status, token_hash, last_seen_at)
       VALUES ($1, $2, 'foreign', 'foreign-host', 'linux', '0.1.0', 'online',
               '0000000000000000000000000000000000000000000000000000000000000000', now())`,
      [otherOrgId, otherSite.rows[0]!.id],
    );
    await sql.end();

    const isolatedListRes = await fetch(`${API}/v1/connectors`, { headers: { cookie: cookieHeader } });
    const isolatedList = await isolatedListRes.json();
    check(
      "operator does not see foreign-org connector",
      !isolatedList.connectors.some((c: { label: string }) => c.label === "foreign"),
    );

    // ===== Path-traversal upload key still rejected =====
    const badKeyRes = await fetch(`${API}/v1/connectors/uploads/..%2Fevil`, {
      method: "PUT",
      headers: { ...auth, "content-type": "image/jpeg" },
      body: fakeJpeg,
    });
    check("path-traversal upload key 400", badKeyRes.status === 400);

    // ===== Phase 1 / M1a: sites =====
    const sitesRes = await fetch(`${API}/v1/sites`, { headers: { cookie: cookieHeader } });
    check("GET /v1/sites 200", sitesRes.status === 200);
    const { sites } = await sitesRes.json();
    check(
      "seed org has exactly one Default site",
      sites.length === 1 && sites[0].label === "Default site",
      sites.map((s: { label: string }) => s.label),
    );
    const defaultSiteId = sites[0].id as string;

    // The connector paired earlier (no siteId in body) landed on the default site.
    const connsAfterSites = await fetch(`${API}/v1/connectors`, { headers: { cookie: cookieHeader } });
    const connsList = await connsAfterSites.json();
    const pairedConn = connsList.connectors.find((c: { id: string }) => c.id === redeemed.connectorId);
    check("connector defaulted to the org's default site", pairedConn?.siteId === defaultSiteId);

    const createSiteRes = await fetch(`${API}/v1/sites`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieHeader },
      body: JSON.stringify({ label: "Warehouse A", timezone: "America/Los_Angeles" }),
    });
    check("POST /v1/sites 201", createSiteRes.status === 201);
    const { site: warehouse } = await createSiteRes.json();
    check("created site carries timezone", warehouse.timezone === "America/Los_Angeles");

    const dupSiteRes = await fetch(`${API}/v1/sites`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieHeader },
      body: JSON.stringify({ label: "warehouse a" }),
    });
    check("duplicate site label (case-insensitive) 409", dupSiteRes.status === 409);

    const badTzRes = await fetch(`${API}/v1/sites`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieHeader },
      body: JSON.stringify({ label: "Bad TZ", timezone: "Mars/Olympus_Mons" }),
    });
    check("unknown timezone 400", badTzRes.status === 400);

    const crossOrgSiteRes = await fetch(
      `${API}/v1/sites/00000000-0000-0000-0000-000000000000`,
      { headers: { cookie: cookieHeader } },
    );
    check("GET cross-org/unknown site 404", crossOrgSiteRes.status === 404);

    const patchSiteRes = await fetch(`${API}/v1/sites/${warehouse.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: cookieHeader },
      body: JSON.stringify({ label: "Warehouse A (north)" }),
    });
    check("PATCH site label 200", patchSiteRes.status === 200);
    const patched = await patchSiteRes.json();
    check("PATCH site returns new label", patched.site.label === "Warehouse A (north)");

    // Pair a second connector explicitly onto the warehouse site.
    const sitePairRes = await fetch(`${API}/v1/pairings`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieHeader },
      body: JSON.stringify({ siteId: warehouse.id }),
    });
    check("POST /v1/pairings with siteId 201", sitePairRes.status === 201);
    const sitePairing = await sitePairRes.json();
    const siteRedeemRes = await fetch(`${API}/v1/pairings/redeem`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code: sitePairing.code,
        hostname: "warehouse-box",
        platform: "linux",
        version: "0.1.0",
      }),
    });
    const siteRedeemed = await siteRedeemRes.json();
    const connsRes2 = await fetch(`${API}/v1/connectors`, { headers: { cookie: cookieHeader } });
    const conns2 = await connsRes2.json();
    const warehouseConn = conns2.connectors.find(
      (c: { id: string }) => c.id === siteRedeemed.connectorId,
    );
    check("redeemed connector attached to chosen site", warehouseConn?.siteId === warehouse.id);

    const delAttachedRes = await fetch(`${API}/v1/sites/${warehouse.id}`, {
      method: "DELETE",
      headers: { cookie: cookieHeader },
    });
    check("DELETE site with connectors 409", delAttachedRes.status === 409);

    const tempSiteRes = await fetch(`${API}/v1/sites`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieHeader },
      body: JSON.stringify({ label: "Temp site" }),
    });
    const { site: tempSite } = await tempSiteRes.json();
    const delEmptyRes = await fetch(`${API}/v1/sites/${tempSite.id}`, {
      method: "DELETE",
      headers: { cookie: cookieHeader },
    });
    check("DELETE empty site 204", delEmptyRes.status === 204);
    const goneRes = await fetch(`${API}/v1/sites/${tempSite.id}`, {
      headers: { cookie: cookieHeader },
    });
    check("deleted site 404", goneRes.status === 404);

    // ===== Phase 1 / M1b: zones =====
    const lobbyPolygon = [
      { x: 0.1, y: 0.1 },
      { x: 0.6, y: 0.12 },
      { x: 0.55, y: 0.7 },
      { x: 0.12, y: 0.65 },
    ];
    const createZoneRes = await fetch(`${API}/v1/cameras/${camera.id}/zones`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieHeader },
      body: JSON.stringify({ label: "Lobby", polygon: lobbyPolygon }),
    });
    check("POST zone 201", createZoneRes.status === 201);
    const { zone: lobbyZone } = await createZoneRes.json();
    check("zone polygon round-trips", JSON.stringify(lobbyZone.polygon) === JSON.stringify(lobbyPolygon));

    const listZonesRes = await fetch(`${API}/v1/cameras/${camera.id}/zones`, {
      headers: { cookie: cookieHeader },
    });
    const zonesList = await listZonesRes.json();
    check("GET zones lists the created zone", zonesList.zones.length === 1 && zonesList.zones[0].id === lobbyZone.id);

    const tooFewRes = await fetch(`${API}/v1/cameras/${camera.id}/zones`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieHeader },
      body: JSON.stringify({ label: "Line", polygon: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }),
    });
    check("zone with <3 points 400", tooFewRes.status === 400);

    const outOfRangeRes = await fetch(`${API}/v1/cameras/${camera.id}/zones`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieHeader },
      body: JSON.stringify({
        label: "Out",
        polygon: [{ x: -0.1, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1.5 }],
      }),
    });
    check("zone with out-of-range coords 400", outOfRangeRes.status === 400);

    const zonesUnknownCamRes = await fetch(
      `${API}/v1/cameras/00000000-0000-0000-0000-000000000000/zones`,
      { headers: { cookie: cookieHeader } },
    );
    check("GET zones for unknown camera 404", zonesUnknownCamRes.status === 404);

    const patchZoneRes = await fetch(`${API}/v1/zones/${lobbyZone.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: cookieHeader },
      body: JSON.stringify({ label: "Lobby (front)" }),
    });
    check("PATCH zone 200", patchZoneRes.status === 200);
    const patchedZone = await patchZoneRes.json();
    check("PATCH zone keeps polygon", patchedZone.zone.polygon.length === 4);

    // Camera delete cascades zones (FK ON DELETE CASCADE) — via SQL since
    // there's no camera DELETE endpoint yet.
    const cascadeCamRes = await fetch(`${API}/v1/cameras`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieHeader },
      body: JSON.stringify({
        connectorId: redeemed.connectorId,
        label: "Cascade cam",
        rtspUrl: "rtsp://example.com:554/cascade",
      }),
    });
    const { camera: cascadeCam } = await cascadeCamRes.json();
    await fetch(`${API}/v1/cameras/${cascadeCam.id}/zones`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieHeader },
      body: JSON.stringify({ label: "Doomed", polygon: lobbyPolygon }),
    });
    const cascadeSql = new Client({ connectionString: DATABASE_URL });
    await cascadeSql.connect();
    await cascadeSql.query("DELETE FROM commands WHERE camera_id = $1", [cascadeCam.id]);
    await cascadeSql.query("DELETE FROM cameras WHERE id = $1", [cascadeCam.id]);
    const orphanZones = await cascadeSql.query(
      "SELECT count(*)::int AS n FROM zones WHERE camera_id = $1",
      [cascadeCam.id],
    );
    await cascadeSql.end();
    check("deleting camera cascades zones", orphanZones.rows[0]?.n === 0);

    // ===== Phase 1 / M1c: schedules =====
    const businessWindows = [1, 2, 3, 4, 5].map((dayOfWeek) => ({
      dayOfWeek,
      startMinute: 9 * 60,
      endMinute: 17 * 60,
    }));
    const createSchedRes = await fetch(`${API}/v1/sites/${defaultSiteId}/schedules`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieHeader },
      body: JSON.stringify({ label: "Business hours", windows: businessWindows }),
    });
    check("POST schedule 201", createSchedRes.status === 201);
    const { schedule: businessSched } = await createSchedRes.json();
    check("schedule serialized 5 windows", businessSched.windows.length === 5);

    const badWindowRes = await fetch(`${API}/v1/sites/${defaultSiteId}/schedules`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieHeader },
      body: JSON.stringify({
        label: "Backwards",
        windows: [{ dayOfWeek: 1, startMinute: 600, endMinute: 540 }],
      }),
    });
    check("schedule window end<=start 400", badWindowRes.status === 400);

    const listSchedRes = await fetch(`${API}/v1/sites/${defaultSiteId}/schedules`, {
      headers: { cookie: cookieHeader },
    });
    const schedList = await listSchedRes.json();
    check("GET schedules lists created", schedList.schedules.length === 1);

    const schedCrossOrgRes = await fetch(
      `${API}/v1/sites/00000000-0000-0000-0000-000000000000/schedules`,
      { headers: { cookie: cookieHeader } },
    );
    check("GET schedules for unknown site 404", schedCrossOrgRes.status === 404);

    // Site delete cascades schedules.
    const cascadeSiteRes = await fetch(`${API}/v1/sites`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieHeader },
      body: JSON.stringify({ label: "Cascade site" }),
    });
    const { site: cascadeSite } = await cascadeSiteRes.json();
    const cascadeSchedRes = await fetch(`${API}/v1/sites/${cascadeSite.id}/schedules`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieHeader },
      body: JSON.stringify({
        label: "Doomed",
        windows: [{ dayOfWeek: 0, startMinute: 0, endMinute: 60 }],
      }),
    });
    const { schedule: doomedSched } = await cascadeSchedRes.json();
    await fetch(`${API}/v1/sites/${cascadeSite.id}`, {
      method: "DELETE",
      headers: { cookie: cookieHeader },
    });
    const schedSql = new Client({ connectionString: DATABASE_URL });
    await schedSql.connect();
    const orphanSched = await schedSql.query(
      "SELECT count(*)::int AS n FROM schedules WHERE id = $1",
      [doomedSched.id],
    );
    await schedSql.end();
    check("deleting site cascades schedules", orphanSched.rows[0]?.n === 0);

    // ===== Phase 1 / M1d: rules =====
    const createRuleRes = await fetch(`${API}/v1/sites/${defaultSiteId}/rules`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieHeader },
      body: JSON.stringify({
        label: "Lobby after hours",
        zoneId: lobbyZone.id,
        scheduleId: businessSched.id,
        trigger: { type: "presence_in_zone", params: {} },
        action: { type: "raise_event", severity: "high" },
      }),
    });
    check("POST rule 201", createRuleRes.status === 201);
    const { rule: lobbyRule } = await createRuleRes.json();
    check("rule defaults enabled", lobbyRule.enabled === true);
    check("rule severity round-trips", lobbyRule.action.severity === "high");

    // Schedule belonging to a different site is rejected.
    const whSchedRes = await fetch(`${API}/v1/sites/${warehouse.id}/schedules`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieHeader },
      body: JSON.stringify({
        label: "Warehouse hours",
        windows: [{ dayOfWeek: 1, startMinute: 0, endMinute: 720 }],
      }),
    });
    const { schedule: whSched } = await whSchedRes.json();
    const wrongSchedRuleRes = await fetch(`${API}/v1/sites/${defaultSiteId}/rules`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieHeader },
      body: JSON.stringify({
        label: "Wrong sched",
        zoneId: lobbyZone.id,
        scheduleId: whSched.id,
        trigger: { type: "presence_in_zone", params: {} },
        action: { type: "raise_event", severity: "low" },
      }),
    });
    check("rule with schedule from different site 422", wrongSchedRuleRes.status === 422);

    // Zone belonging to a different site is rejected: register a camera on the
    // warehouse connector, draw a zone there, then reference it from the
    // default site.
    const whCamRes = await fetch(`${API}/v1/cameras`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieHeader },
      body: JSON.stringify({
        connectorId: siteRedeemed.connectorId,
        label: "Warehouse cam",
        rtspUrl: "rtsp://example.com:554/warehouse",
      }),
    });
    const { camera: whCam } = await whCamRes.json();
    const whZoneRes = await fetch(`${API}/v1/cameras/${whCam.id}/zones`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieHeader },
      body: JSON.stringify({ label: "Dock", polygon: lobbyPolygon }),
    });
    const { zone: whZone } = await whZoneRes.json();
    const wrongZoneRuleRes = await fetch(`${API}/v1/sites/${defaultSiteId}/rules`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieHeader },
      body: JSON.stringify({
        label: "Wrong zone",
        zoneId: whZone.id,
        trigger: { type: "presence_in_zone", params: {} },
        action: { type: "raise_event", severity: "low" },
      }),
    });
    check("rule with zone from different site 422", wrongZoneRuleRes.status === 422);

    const toggleRuleRes = await fetch(`${API}/v1/rules/${lobbyRule.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: cookieHeader },
      body: JSON.stringify({ enabled: false }),
    });
    check("PATCH rule enabled=false 200", toggleRuleRes.status === 200);
    const toggledRule = await toggleRuleRes.json();
    check("rule toggle persisted", toggledRule.rule.enabled === false);

    const listRulesRes = await fetch(`${API}/v1/sites/${defaultSiteId}/rules`, {
      headers: { cookie: cookieHeader },
    });
    const rulesList = await listRulesRes.json();
    check(
      "GET rules lists the rule (disabled)",
      rulesList.rules.length === 1 && rulesList.rules[0].enabled === false,
    );

    // Deleting the zone cascades the rule.
    const delZoneRes = await fetch(`${API}/v1/zones/${lobbyZone.id}`, {
      method: "DELETE",
      headers: { cookie: cookieHeader },
    });
    check("DELETE zone 204", delZoneRes.status === 204);
    const rulesAfterZoneDel = await fetch(`${API}/v1/sites/${defaultSiteId}/rules`, {
      headers: { cookie: cookieHeader },
    });
    const rulesAfter = await rulesAfterZoneDel.json();
    check("deleting zone cascades rules", rulesAfter.rules.length === 0);

    // ===== Logout =====
    const logoutRes = await fetch(`${API}/v1/auth/logout`, {
      method: "POST",
      headers: { cookie: cookieHeader },
    });
    check("POST /v1/auth/logout 204", logoutRes.status === 204);

    const postLogoutMe = await fetch(`${API}/v1/auth/me`, { headers: { cookie: cookieHeader } });
    check("GET /v1/auth/me after logout 401", postLogoutMe.status === 401);
  } finally {
    await api.stop();
    await s3.close();
  }

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed`);
    process.exit(1);
  } else {
    console.log("\nall checks passed");
    process.exit(0);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
