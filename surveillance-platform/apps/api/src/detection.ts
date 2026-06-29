import { randomUUID } from "node:crypto";
import type { FastifyBaseLogger } from "fastify";
import { CONFIG_CHANGED_CHANNEL, type Command } from "@surveillance/shared";
import type { Store } from "./db/store.js";

// Wake signal for the detection supervisor. The supervisor is a reconciler
// that would otherwise query Postgres every tick forever — which alone keeps
// Neon's serverless compute from auto-suspending (scaling to zero), burning
// the monthly compute allowance even with zero cameras live. Instead, the tick
// only queries when something *could* have changed the desired state:
//   - rules/zones/schedules edits (notifyConfigChanged)
//   - a camera coming online or an operator preview starting
//   - a connector reconnecting after being offline
// ...and it keeps reconciling as long as the last pass saw live work (targets
// or active detection previews to rotate/heal). When nothing is armed and
// nothing is live, the tick does no DB work and Neon can suspend.
class DetectionSignal {
  private dirty = true; // first tick after boot always reconciles
  private active = false; // last reconcile found targets or live detection previews

  markDirty(): void {
    this.dirty = true;
  }

  shouldReconcile(): boolean {
    return this.dirty || this.active;
  }

  settle(active: boolean): void {
    this.dirty = false;
    this.active = active;
  }
}

// Process-wide singleton: mutation handlers and the connector auth path poke
// this without having to thread it through every route registrar.
export const detectionSignal = new DetectionSignal();

export function markDetectionDirty(): void {
  detectionSignal.markDirty();
}

// Fire-and-forget poke after any rules/zones/schedules mutation so the
// worker drops its cached config. Sites are few and the rebuild is four
// queries, so the payload carries no site id — the worker just invalidates
// everything. Losing the notify is harmless: the cache also expires on TTL.
// A config change can also create/remove a detection target, so wake the
// supervisor out of its idle (non-querying) state on the same hook.
export function notifyConfigChanged(store: Store, log: FastifyBaseLogger): void {
  markDetectionDirty();
  store.notify(CONFIG_CHANGED_CHANNEL, "").catch((err) => {
    log.warn({ err }, "config_changed notify failed");
  });
}

// Detection supervisor: a reconciler, not a set of lifecycle hooks. Every
// tick it compares desired state (online cameras with >= 1 enabled rule
// should have an HLS pipeline running) against actual state (active preview
// rows) and issues start_detection / stop_detection commands to converge.
// Rule edits, zone deletes, camera state flips, connector restarts, lost
// commands, and crashed FFmpegs all heal through the same code path within
// one tick — no mutation handler needs to know detection exists.
//
// One active preview per camera (DB unique index). If an operator is already
// previewing a target camera, detection rides those segments — the worker
// listens to every segment PUT — instead of opening a second RTSP pull that
// many IP cameras would refuse.

// Matches StartPreviewPayloadSchema's max. The connector's FFmpeg exits at
// -t maxDuration, so the supervisor rotates sessions shortly before that.
const MAX_DURATION_SECONDS = 3600;
const ROTATE_MARGIN_SECONDS = 90;
// For detection previews, last_heartbeat_at means "last segment upload"
// (the HLS PUT handler bumps it). Staler than this = pipeline is dead
// (connector restarted, FFmpeg crashed without the connector noticing) —
// recycle the session. The same margin doubles as the warmup grace period.
const STALL_SECONDS = 90;
export const SEGMENT_SECONDS = 2;
const WINDOW_SEGMENTS = 5;

function detectionCommand(
  kind: "start_detection" | "stop_detection",
  payload: Record<string, unknown>,
): Command {
  return {
    id: randomUUID(),
    kind,
    issuedAt: new Date().toISOString(),
    payload,
  } as Command;
}

// Returns true when this pass saw live work (detection targets or active
// detection previews). The supervisor uses that to decide whether the next
// tick needs to query at all.
export async function reconcileDetection(store: Store, log: FastifyBaseLogger): Promise<boolean> {
  const [targets, activeDetections] = await Promise.all([
    store.listDetectionTargets(),
    store.listActiveDetectionPreviews(),
  ]);
  const targetByCamera = new Map(targets.map((t) => [t.cameraId, t]));
  const now = Date.now();

  for (const preview of activeDetections) {
    const target = targetByCamera.get(preview.cameraId);
    const ageSeconds = (now - Date.parse(preview.startedAt)) / 1000;
    const sinceSegmentSeconds = (now - Date.parse(preview.lastHeartbeatAt)) / 1000;

    const obsolete = !target;
    const expiring = ageSeconds > preview.maxDurationSeconds - ROTATE_MARGIN_SECONDS;
    const stalled = ageSeconds > STALL_SECONDS && sinceSegmentSeconds > STALL_SECONDS;
    if (!obsolete && !expiring && !stalled) continue;

    const reason = obsolete ? "no enabled rules" : expiring ? "rotation" : "stalled";
    log.info({ previewId: preview.id, cameraId: preview.cameraId, reason }, "ending detection preview");
    await store.endPreview(preview.id);
    await store.enqueueCommand(
      preview.connectorId,
      detectionCommand("stop_detection", {
        cameraId: preview.cameraId,
        previewId: preview.id,
      }),
      preview.cameraId,
    );
    // Expiring/stalled targets fall through to the start loop below, which
    // sees no active preview and spins up the replacement this same tick.
  }

  for (const target of targets) {
    const active = await store.getActivePreviewForCamera(target.cameraId);
    // An operator preview already feeds the worker; a live detection preview
    // needs nothing. Only a camera with no pipeline gets a new session.
    if (active) continue;

    const preview = await store.createPreview({
      cameraId: target.cameraId,
      maxDurationSeconds: MAX_DURATION_SECONDS,
      startedBy: "detection",
    });
    await store.enqueueCommand(
      target.connectorId,
      detectionCommand("start_detection", {
        cameraId: target.cameraId,
        previewId: preview.id,
        rtspUrl: target.rtspUrl,
        maxDurationSeconds: MAX_DURATION_SECONDS,
        segmentSeconds: SEGMENT_SECONDS,
        windowSegments: WINDOW_SEGMENTS,
      }),
      target.cameraId,
    );
    log.info({ previewId: preview.id, cameraId: target.cameraId }, "started detection preview");
  }

  // Keep ticking (and querying) while there is anything to rotate, heal, or
  // start. Once both are empty, the supervisor idles until a mutation pokes it.
  return targets.length > 0 || activeDetections.length > 0;
}

export function startDetectionSupervisor(
  store: Store,
  log: FastifyBaseLogger,
  tickMs = 10_000,
  signal: DetectionSignal = detectionSignal,
): () => void {
  let stopped = false;
  let running = false;
  const timer = setInterval(() => {
    if (stopped || running) return;
    // Idle fast-path: nothing armed and nothing live since the last pass, so
    // skip the DB round-trip entirely and let Neon's compute suspend.
    if (!signal.shouldReconcile()) return;
    running = true;
    reconcileDetection(store, log)
      .then((active) => signal.settle(active))
      .catch((err) => log.error({ err }, "detection supervisor tick failed"))
      .finally(() => {
        running = false;
      });
  }, tickMs);
  timer.unref();
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
