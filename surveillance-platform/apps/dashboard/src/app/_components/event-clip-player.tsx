"use client";

// Clip playback for a behavior event: ~6s VOD HLS (trigger segment ± one
// neighbor) with the zone polygon and the worker's detection boxes overlaid
// as SVG. Detection frames carry absolute epoch tsMs; the first frame
// anchors video currentTime onto that axis.

import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import type { Event as EventRecord } from "@surveillance/shared";
import { EVENT_DETECTIONS_URL, EVENT_PLAYLIST_URL } from "@/lib/api";

interface DetectionFrame {
  tsMs: number;
  detections: Array<{ cls: string; conf: number; bbox: [number, number, number, number] }>;
}

/** Widest gap between video time and a detection frame we still draw. */
const FRAME_MATCH_MS = 400;

export function EventClipModal({
  event,
  onClose,
}: {
  event: EventRecord;
  onClose: () => void;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10, 8, 2, 0.72)",
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--paper, #fff)",
          width: "min(860px, 100%)",
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
          <span style={{ fontFamily: "var(--font-serif), 'Instrument Serif', serif", fontSize: 24 }}>
            {event.ruleLabel}
          </span>
          <span
            style={{
              fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
              fontSize: 11,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color:
                event.severity === "high"
                  ? "var(--red)"
                  : event.severity === "medium"
                    ? "var(--gold)"
                    : "var(--ink-2)",
            }}
          >
            {event.severity} · {event.triggerType.replaceAll("_", " ")}
          </span>
          <span
            style={{
              fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
              fontSize: 11,
              color: "var(--ink-2)",
            }}
          >
            {event.cameraLabel} / {event.zoneLabel} ·{" "}
            {new Date(event.occurredAt).toLocaleString()}
          </span>
          <div style={{ flex: 1 }} />
          <button
            onClick={onClose}
            style={{
              border: "none",
              background: "none",
              cursor: "pointer",
              fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
              fontSize: 12,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--ink-2)",
            }}
          >
            Close ✕
          </button>
        </div>
        <EventClipPlayer eventId={event.id} />
      </div>
    </div>
  );
}

export function EventClipPlayer({ eventId }: { eventId: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [aspect, setAspect] = useState("16 / 9");
  const [frames, setFrames] = useState<DetectionFrame[]>([]);
  const [zone, setZone] = useState<{ x: number; y: number }[] | null>(null);
  const [boxes, setBoxes] = useState<Array<[number, number, number, number]>>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(EVENT_DETECTIONS_URL(eventId))
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`detections ${res.status}`))))
      .then((data: { frames: DetectionFrame[]; zonePolygon: { x: number; y: number }[] | null }) => {
        if (cancelled) return;
        setFrames(data.frames);
        setZone(data.zonePolygon);
      })
      .catch(() => {
        // Overlay is best-effort; the clip still plays without it.
      });
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let hls: Hls | null = null;
    const src = EVENT_PLAYLIST_URL(eventId);
    if (Hls.isSupported()) {
      hls = new Hls();
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (data.fatal) setError("Clip unavailable — its segments have expired from storage.");
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      video.addEventListener("error", () => setError("Clip playback failed."));
    } else {
      setError("Browser does not support HLS playback.");
    }
    return () => hls?.destroy();
  }, [eventId]);

  // Sync detection boxes to playback position via rAF.
  useEffect(() => {
    if (frames.length === 0) return;
    const clipStartMs = frames[0]!.tsMs;
    let raf = 0;
    const tick = () => {
      const video = videoRef.current;
      if (video) {
        const t = clipStartMs + video.currentTime * 1000;
        let best: DetectionFrame | null = null;
        for (const f of frames) {
          if (f.tsMs > t + FRAME_MATCH_MS) break;
          if (Math.abs(f.tsMs - t) <= FRAME_MATCH_MS) {
            if (!best || Math.abs(f.tsMs - t) < Math.abs(best.tsMs - t)) best = f;
          }
        }
        setBoxes(best ? best.detections.map((d) => d.bbox) : []);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [frames]);

  return (
    <div>
      <div style={{ position: "relative", aspectRatio: aspect, background: "#000" }}>
        <video
          ref={videoRef}
          controls
          autoPlay
          muted
          playsInline
          loop
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            if (v.videoWidth && v.videoHeight) setAspect(`${v.videoWidth} / ${v.videoHeight}`);
          }}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        />
        <svg
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
          }}
        >
          {zone && zone.length >= 3 && (
            <polygon
              points={zone.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="rgba(233, 184, 100, 0.14)"
              stroke="rgba(233, 184, 100, 0.9)"
              strokeWidth={0.004}
            />
          )}
          {boxes.map(([x, y, w, h], i) => (
            <rect
              key={i}
              x={x}
              y={y}
              width={w}
              height={h}
              fill="none"
              stroke="rgba(220, 60, 60, 0.95)"
              strokeWidth={0.004}
            />
          ))}
        </svg>
      </div>
      {error && (
        <p
          style={{
            color: "var(--red, crimson)",
            fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
            fontSize: 12,
            marginTop: 8,
          }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
