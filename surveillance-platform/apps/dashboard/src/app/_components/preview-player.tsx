"use client";

import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { api } from "@/lib/api";

const HEARTBEAT_INTERVAL_MS = 15_000;

type Status =
  | { kind: "starting" }
  | { kind: "live" }
  | { kind: "error"; message: string }
  | { kind: "stopped" };

export function PreviewPlayer({ cameraId }: { cameraId: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "starting" });

  useEffect(() => {
    // React StrictMode double-invokes effects in dev, but we want exactly one
    // start/stop pair per mount. The stop callback in the cleanup function
    // handles both — and the API's start endpoint is idempotent if a stale
    // session is still active.
    let cancelled = false;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

    async function go() {
      try {
        const session = await api.startPreview(cameraId);
        if (cancelled) {
          api.stopPreview(cameraId).catch(() => {});
          return;
        }

        const manifestUrl = session.manifestUrl;
        const video = videoRef.current;
        if (!video) return;

        if (Hls.isSupported()) {
          const hls = new Hls({
            liveSyncDuration: 4,
            liveMaxLatencyDuration: 12,
            // First manifest fetch can 404 while the connector is warming up
            // FFmpeg. Retry a few times before giving up.
            manifestLoadingMaxRetry: 6,
            manifestLoadingRetryDelay: 1000,
            manifestLoadingMaxRetryTimeout: 8000,
          });
          hlsRef.current = hls;
          hls.loadSource(manifestUrl);
          hls.attachMedia(video);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            setStatus({ kind: "live" });
            video.play().catch(() => {});
          });
          hls.on(Hls.Events.ERROR, (_evt, data) => {
            if (data.fatal) {
              setStatus({
                kind: "error",
                message: `${data.type}: ${data.details ?? "playback failed"}`,
              });
            }
          });
        } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
          // Safari plays HLS natively without hls.js.
          video.src = manifestUrl;
          video.addEventListener("playing", () => setStatus({ kind: "live" }));
          video.addEventListener("error", () =>
            setStatus({ kind: "error", message: "browser playback failed" }),
          );
        } else {
          setStatus({ kind: "error", message: "browser does not support HLS" });
        }

        heartbeatTimer = setInterval(() => {
          api.heartbeatPreview(session.preview.id).catch(() => {});
        }, HEARTBEAT_INTERVAL_MS);
      } catch (e) {
        if (cancelled) return;
        setStatus({
          kind: "error",
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }
    void go();

    return () => {
      cancelled = true;
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      hlsRef.current?.destroy();
      hlsRef.current = null;
      api.stopPreview(cameraId).catch(() => {});
    };
  }, [cameraId]);

  return (
    <div style={{ marginTop: 16 }}>
      <StatusBadge status={status} />
      <video
        ref={videoRef}
        controls
        autoPlay
        muted
        playsInline
        style={{
          width: "100%",
          maxHeight: 540,
          background: "#000",
          borderRadius: 6,
          marginTop: 8,
        }}
      />
      {status.kind === "error" && (
        <p style={{ color: "crimson", fontSize: 14, marginTop: 8 }}>{status.message}</p>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: Status }) {
  const colors: Record<Status["kind"], { bg: string; fg: string; label: string }> = {
    starting: { bg: "#fef3c7", fg: "#92400e", label: "Starting…" },
    live: { bg: "#dcfce7", fg: "#166534", label: "Live" },
    error: { bg: "#fee2e2", fg: "#991b1b", label: "Error" },
    stopped: { bg: "#f1f5f9", fg: "#475569", label: "Stopped" },
  };
  const c = colors[status.kind];
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        background: c.bg,
        color: c.fg,
      }}
    >
      {c.label}
    </span>
  );
}
