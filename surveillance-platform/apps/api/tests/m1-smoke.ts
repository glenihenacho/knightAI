/**
 * End-to-end smoke test for the API.
 *
 * Runs against:
 *   - real Postgres (DATABASE_URL must point at a fresh DB; this script wipes it)
 *   - in-process S3 stub on port 19000 (accepts any PUT/GET, returns 200/404)
 *
 * Exercises the full validate_rtsp lifecycle:
 *   create org -> create pairing -> redeem -> create camera -> poll command
 *   -> upload snapshot -> submit result -> verify camera state -> get snapshot URL
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { setTimeout as sleep } from "node:timers/promises";
import { Client } from "pg";

const API_PORT = 14099;
const S3_PORT = 19000;
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
    DROP TABLE IF EXISTS commands CASCADE;
    DROP TABLE IF EXISTS cameras CASCADE;
    DROP TABLE IF EXISTS connectors CASCADE;
    DROP TABLE IF EXISTS pairings CASCADE;
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

interface S3Stub {
  putCount: number;
  lastBody: Buffer | null;
  lastKey: string | null;
  close(): Promise<void>;
}

function startS3Stub(): Promise<S3Stub> {
  return new Promise((resolve) => {
    const stub: S3Stub = {
      putCount: 0,
      lastBody: null,
      lastKey: null,
      close: () => new Promise((res) => server.close(() => res())),
    };
    const server = createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const body = Buffer.concat(chunks);
      if (req.method === "PUT") {
        stub.putCount += 1;
        stub.lastBody = body;
        stub.lastKey = req.url ?? null;
        res.writeHead(200, { ETag: '"deadbeef"' });
        res.end();
        return;
      }
      if (req.method === "GET") {
        if (stub.lastBody && req.url?.includes(stub.lastKey?.split("?")[0] ?? "")) {
          res.writeHead(200, { "content-type": "image/jpeg" });
          res.end(stub.lastBody);
          return;
        }
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(405);
      res.end();
    });
    server.listen(S3_PORT, () => resolve(stub));
  });
}

async function startApi(): Promise<{ stop: () => Promise<void> }> {
  const tsxBin = new URL("../node_modules/.bin/tsx", import.meta.url).pathname;
  const serverEntry = new URL("../src/server.ts", import.meta.url).pathname;
  const child = spawn(
    tsxBin,
    [serverEntry],
    {
      env: {
        ...process.env,
        NODE_ENV: "test",
        PORT: String(API_PORT),
        DATABASE_URL,
        PUBLIC_BASE_URL: `http://127.0.0.1:${API_PORT}`,
        MIGRATE_ON_BOOT: "true",
        S3_ENDPOINT: `http://127.0.0.1:${S3_PORT}`,
        S3_REGION: "us-east-1",
        S3_BUCKET: "surveillance",
        S3_ACCESS_KEY_ID: "test",
        S3_SECRET_ACCESS_KEY: "test",
        S3_FORCE_PATH_STYLE: "true",
        SNAPSHOT_URL_TTL_SECONDS: "120",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.stdout.on("data", (b) => process.stderr.write(`[api] ${b}`));
  child.stderr.on("data", (b) => process.stderr.write(`[api!] ${b}`));

  // Wait for /healthz to come up
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
    stop: () =>
      new Promise((resolve) => {
        child.once("exit", () => resolve());
        child.kill("SIGTERM");
      }),
  };
}

async function main() {
  await wipeDb();
  const s3 = await startS3Stub();
  const api = await startApi();

  try {
    // 1. create org
    const orgRes = await fetch(`http://127.0.0.1:${API_PORT}/v1/organizations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Acme" }),
    });
    check("create organization 201", orgRes.status === 201);
    const org = await orgRes.json();
    check("organization has uuid", typeof org.id === "string" && org.id.length === 36);

    // 2. create pairing
    const pairRes = await fetch(`http://127.0.0.1:${API_PORT}/v1/pairings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ organizationId: org.id }),
    });
    check("create pairing 201", pairRes.status === 201);
    const pairing = await pairRes.json();
    check("pairing code matches XXXX-XXXX", /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(pairing.code));

    // 3. redeem pairing
    const redeemRes = await fetch(`http://127.0.0.1:${API_PORT}/v1/pairings/redeem`, {
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
    check("redeem returned token >= 64 chars", redeemed.connectorToken.length >= 64);

    // 4. redeeming the same code again should fail
    const replayRes = await fetch(`http://127.0.0.1:${API_PORT}/v1/pairings/redeem`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code: pairing.code,
        hostname: "evil",
        platform: "linux",
        version: "0.1.0",
      }),
    });
    check("redeem replay 404", replayRes.status === 404);

    // 5. list connectors via dashboard
    const listRes = await fetch(`http://127.0.0.1:${API_PORT}/v1/connectors`);
    check("list connectors 200", listRes.status === 200);
    const list = await listRes.json();
    check("list contains the new connector", list.connectors.some((c: { id: string }) => c.id === redeemed.connectorId));

    // 6. unauthorized poll
    const noAuthRes = await fetch(`http://127.0.0.1:${API_PORT}/v1/connectors/commands/next`);
    check("poll without auth 401", noAuthRes.status === 401);

    // 7. wrong token
    const badAuthRes = await fetch(`http://127.0.0.1:${API_PORT}/v1/connectors/commands/next`, {
      headers: {
        authorization: "Bearer not-a-real-token",
        "x-connector-id": redeemed.connectorId,
      },
    });
    check("poll with bad token 401", badAuthRes.status === 401);

    const auth = {
      authorization: `Bearer ${redeemed.connectorToken}`,
      "x-connector-id": redeemed.connectorId,
    };

    // 8. valid poll, no work yet
    const emptyPollRes = await fetch(`http://127.0.0.1:${API_PORT}/v1/connectors/commands/next`, {
      headers: auth,
    });
    check("poll with no work 204", emptyPollRes.status === 204);

    // 9. create camera (triggers validate_rtsp command)
    const camRes = await fetch(`http://127.0.0.1:${API_PORT}/v1/cameras`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        connectorId: redeemed.connectorId,
        label: "Front door",
        rtspUrl: "rtsp://example.com:554/stream",
      }),
    });
    check("create camera 201", camRes.status === 201);
    const { camera, queuedCommandId } = await camRes.json();
    check("camera state validating", camera.state === "validating");

    // 10. poll - should now get the validate command
    const cmdRes = await fetch(`http://127.0.0.1:${API_PORT}/v1/connectors/commands/next`, {
      headers: auth,
    });
    check("poll returns command 200", cmdRes.status === 200);
    const cmd = await cmdRes.json();
    check("command id matches queued", cmd.id === queuedCommandId);
    check("command kind validate_rtsp", cmd.kind === "validate_rtsp");
    check("command payload has cameraId", cmd.payload.cameraId === camera.id);

    // 11. second poll - command is now in_flight, queue empty for this connector
    const followupPollRes = await fetch(`http://127.0.0.1:${API_PORT}/v1/connectors/commands/next`, {
      headers: auth,
    });
    check("second poll returns 204 (in_flight not re-issued)", followupPollRes.status === 204);

    // 12. upload snapshot bytes
    const fakeJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0]);
    const uploadKey = "snapshot-abc123";
    const upRes = await fetch(`http://127.0.0.1:${API_PORT}/v1/connectors/uploads/${uploadKey}`, {
      method: "PUT",
      headers: { ...auth, "content-type": "image/jpeg" },
      body: fakeJpeg,
    });
    check("upload 204", upRes.status === 204);
    check("S3 stub received PUT", s3.putCount === 1);
    check("S3 stub got matching bytes", s3.lastBody?.equals(fakeJpeg) === true);
    check("S3 key has snapshots/ prefix", s3.lastKey?.includes(`/surveillance/snapshots/${uploadKey}.jpg`) === true, s3.lastKey);

    // 13. submit result
    const resultRes = await fetch(
      `http://127.0.0.1:${API_PORT}/v1/connectors/commands/${cmd.id}/result`,
      {
        method: "POST",
        headers: { ...auth, "content-type": "application/json" },
        body: JSON.stringify({
          commandId: cmd.id,
          status: "ok",
          durationMs: 1234,
          finishedAt: new Date().toISOString(),
          validateRtsp: {
            reachable: true,
            codec: "h264",
            width: 1920,
            height: 1080,
            fps: 15,
            snapshotUploadKey: uploadKey,
          },
        }),
      },
    );
    check("submit result 204", resultRes.status === 204);

    // 14. submit again -> command already done -> still finds row, but updates again. We have no protection there yet; document.
    // (skipping idempotency assertion)

    // 15. cameras list - state should be online with snapshot key
    const camsRes = await fetch(`http://127.0.0.1:${API_PORT}/v1/cameras`);
    const cams = await camsRes.json();
    const updated = cams.cameras.find((c: { id: string }) => c.id === camera.id);
    check("camera state online after validation", updated?.state === "online", updated);
    check("camera last_snapshot_key set", updated?.lastSnapshotKey === uploadKey);

    // 16. snapshot URL endpoint redirects to signed URL
    const snapRes = await fetch(`http://127.0.0.1:${API_PORT}/v1/snapshots/${uploadKey}`, {
      redirect: "manual",
    });
    check("snapshot redirect 302", snapRes.status === 302);
    const loc = snapRes.headers.get("location") ?? "";
    check("snapshot redirect points at S3 stub", loc.startsWith(`http://127.0.0.1:${S3_PORT}/surveillance/snapshots/${uploadKey}.jpg`));
    check("signed URL has X-Amz-Signature", loc.includes("X-Amz-Signature="));

    // 17. nonexistent org rejects pairing creation
    const badOrgRes = await fetch(`http://127.0.0.1:${API_PORT}/v1/pairings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ organizationId: "00000000-0000-0000-0000-000000000000" }),
    });
    check("create pairing for missing org 404", badOrgRes.status === 404);

    // 18. invalid upload key rejected
    const badKeyRes = await fetch(`http://127.0.0.1:${API_PORT}/v1/connectors/uploads/..%2Fevil`, {
      method: "PUT",
      headers: { ...auth, "content-type": "image/jpeg" },
      body: fakeJpeg,
    });
    check("path-traversal upload key 400", badKeyRes.status === 400);

    // 19. cross-connector result submission is rejected (defence in depth)
    // Pair a second connector and have it try to submit a result for connector
    // #1's already-claimed command. We expect 404 (the row is invisible to it).
    const pair2Res = await fetch(`http://127.0.0.1:${API_PORT}/v1/pairings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ organizationId: org.id }),
    });
    const pair2 = await pair2Res.json();
    const redeem2Res = await fetch(`http://127.0.0.1:${API_PORT}/v1/pairings/redeem`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code: pair2.code,
        hostname: "second-box",
        platform: "linux",
        version: "0.1.0",
      }),
    });
    const redeem2 = await redeem2Res.json();
    const auth2 = {
      authorization: `Bearer ${redeem2.connectorToken}`,
      "x-connector-id": redeem2.connectorId,
    };

    // Create a fresh camera so the first connector has a queued command we can
    // try to hijack from connector #2.
    const cam2Res = await fetch(`http://127.0.0.1:${API_PORT}/v1/cameras`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        connectorId: redeemed.connectorId,
        label: "Back door",
        rtspUrl: "rtsp://example.com:554/back",
      }),
    });
    const { queuedCommandId: victimCommandId } = await cam2Res.json();

    const hijackRes = await fetch(
      `http://127.0.0.1:${API_PORT}/v1/connectors/commands/${victimCommandId}/result`,
      {
        method: "POST",
        headers: { ...auth2, "content-type": "application/json" },
        body: JSON.stringify({
          commandId: victimCommandId,
          status: "ok",
          durationMs: 1,
          finishedAt: new Date().toISOString(),
          validateRtsp: { reachable: false, error: "hijacked" },
        }),
      },
    );
    check("cross-connector result hijack 404", hijackRes.status === 404);

    // Cross-check: the original camera state should NOT have flipped to error.
    const camsAfterRes = await fetch(`http://127.0.0.1:${API_PORT}/v1/cameras`);
    const camsAfter = await camsAfterRes.json();
    const backDoor = camsAfter.cameras.find((c: { label: string }) => c.label === "Back door");
    check("victim camera unchanged (still validating)", backDoor?.state === "validating");
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
