"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PolygonPoint, Zone } from "@surveillance/shared";
import { Button, Eyebrow, Input } from "@surveillance/ui";
import { api } from "@/lib/api";

// Polygon editor over a camera frame. All coordinates are normalized [0,1]
// against the rendered frame: the SVG overlay uses viewBox="0 0 1 1" with
// preserveAspectRatio="none", so normalized points render directly and stay
// glued to the same pixels of the frame at any element size.

interface ZoneEditorProps {
  cameraId: string;
  snapshotUrl: string | null;
  zones: Zone[];
  /** Called after any create/update/delete so the parent can refetch. */
  onChanged: () => void;
}

type Mode = { kind: "idle" } | { kind: "draw" } | { kind: "edit"; zoneId: string };

interface DragState {
  pointIndex: number;
  /** Which point list is being dragged: the draft or the edited zone. */
  target: "draft" | "edit";
}

export function ZoneEditor({ cameraId, snapshotUrl, zones, onChanged }: ZoneEditorProps) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [mode, setMode] = useState<Mode>({ kind: "idle" });
  const [draft, setDraft] = useState<PolygonPoint[]>([]);
  const [draftClosed, setDraftClosed] = useState(false);
  const [draftLabel, setDraftLabel] = useState("");
  const [editPoints, setEditPoints] = useState<PolygonPoint[]>([]);
  const [editDirty, setEditDirty] = useState(false);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cancel = useCallback(() => {
    setMode({ kind: "idle" });
    setDraft([]);
    setDraftClosed(false);
    setDraftLabel("");
    setEditPoints([]);
    setEditDirty(false);
    setError(null);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cancel]);

  // Reset editing state when the camera (and thus the zone set) changes.
  useEffect(() => {
    cancel();
  }, [cameraId, cancel]);

  function toNormalized(e: { clientX: number; clientY: number }): PolygonPoint {
    const rect = frameRef.current!.getBoundingClientRect();
    const clamp = (v: number) => Math.min(1, Math.max(0, v));
    return {
      x: clamp((e.clientX - rect.left) / rect.width),
      y: clamp((e.clientY - rect.top) / rect.height),
    };
  }

  function onFrameClick(e: React.MouseEvent) {
    if (mode.kind !== "draw" || draftClosed || drag) return;
    setDraft((d) => [...d, toNormalized(e)]);
  }

  function onFrameDoubleClick(e: React.MouseEvent) {
    e.preventDefault();
    if (mode.kind !== "draw" || draftClosed) return;
    if (draft.length >= 3) setDraftClosed(true);
  }

  function onFrameMouseMove(e: React.MouseEvent) {
    if (!drag) return;
    const p = toNormalized(e);
    if (drag.target === "draft") {
      setDraft((d) => d.map((pt, i) => (i === drag.pointIndex ? p : pt)));
    } else {
      setEditPoints((d) => d.map((pt, i) => (i === drag.pointIndex ? p : pt)));
      setEditDirty(true);
    }
  }

  function onFrameMouseUp() {
    setDrag(null);
  }

  async function saveDraft() {
    setPending(true);
    setError(null);
    try {
      await api.createZone(cameraId, { label: draftLabel, polygon: draft });
      cancel();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  async function saveEdit() {
    if (mode.kind !== "edit") return;
    setPending(true);
    setError(null);
    try {
      await api.updateZone(mode.zoneId, { polygon: editPoints });
      cancel();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  async function deleteZone(zoneId: string) {
    setPending(true);
    setError(null);
    try {
      await api.deleteZone(zoneId);
      if (mode.kind === "edit" && mode.zoneId === zoneId) cancel();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  function startEdit(zone: Zone) {
    setMode({ kind: "edit", zoneId: zone.id });
    setEditPoints(zone.polygon.map((p) => ({ ...p })));
    setEditDirty(false);
    setDraft([]);
    setDraftClosed(false);
  }

  const toPointsAttr = (pts: PolygonPoint[]) => pts.map((p) => `${p.x},${p.y}`).join(" ");
  const editingZoneId = mode.kind === "edit" ? mode.zoneId : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div
        ref={frameRef}
        onClick={onFrameClick}
        onDoubleClick={onFrameDoubleClick}
        onMouseMove={onFrameMouseMove}
        onMouseUp={onFrameMouseUp}
        onMouseLeave={onFrameMouseUp}
        style={{
          position: "relative",
          aspectRatio: "16 / 9",
          background: "#0a0a08",
          border: "1px solid var(--rule)",
          cursor: mode.kind === "draw" && !draftClosed ? "crosshair" : "default",
          userSelect: "none",
        }}
      >
        {snapshotUrl ? (
          <img
            src={snapshotUrl}
            alt="Camera frame"
            draggable={false}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "fill" }}
          />
        ) : (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--ink-2)",
              fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
              fontSize: 11,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
            }}
          >
            No snapshot yet — zones can still be drawn
          </div>
        )}

        <svg
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}
        >
          {zones
            .filter((z) => z.id !== editingZoneId)
            .map((z) => (
              <polygon
                key={z.id}
                points={toPointsAttr(z.polygon)}
                fill="rgba(233, 184, 100, 0.18)"
                stroke="var(--gold, #e9b864)"
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
              />
            ))}

          {editingZoneId && (
            <EditablePolygon
              points={editPoints}
              onGrab={(i) => setDrag({ pointIndex: i, target: "edit" })}
            />
          )}

          {mode.kind === "draw" && draft.length > 0 && (
            <>
              {draftClosed ? (
                <polygon
                  points={toPointsAttr(draft)}
                  fill="rgba(233, 184, 100, 0.28)"
                  stroke="var(--gold, #e9b864)"
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                />
              ) : (
                <polyline
                  points={toPointsAttr(draft)}
                  fill="none"
                  stroke="var(--gold, #e9b864)"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  vectorEffect="non-scaling-stroke"
                />
              )}
              {draft.map((p, i) => (
                <Vertex
                  key={i}
                  point={p}
                  onGrab={() => setDrag({ pointIndex: i, target: "draft" })}
                />
              ))}
            </>
          )}
        </svg>
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        {mode.kind === "idle" && (
          <Button variant="primary" onClick={() => setMode({ kind: "draw" })}>
            Draw zone
          </Button>
        )}
        {mode.kind === "draw" && !draftClosed && (
          <>
            <Eyebrow gold>
              Click to add vertices ({draft.length}) · double-click to close · Esc to cancel
            </Eyebrow>
            <Button onClick={cancel}>Cancel</Button>
          </>
        )}
        {mode.kind === "draw" && draftClosed && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void saveDraft();
            }}
            style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}
          >
            <div style={{ minWidth: 220 }}>
              <Input label="Zone label" value={draftLabel} onChange={setDraftLabel} required autoFocus />
            </div>
            <Button type="submit" variant="primary" disabled={pending || draftLabel.length === 0}>
              {pending ? "Saving…" : "Save zone →"}
            </Button>
            <Button onClick={cancel}>Cancel</Button>
          </form>
        )}
        {mode.kind === "edit" && (
          <>
            <Eyebrow gold>Drag vertices to adjust · Esc to cancel</Eyebrow>
            <Button variant="primary" onClick={() => void saveEdit()} disabled={pending || !editDirty}>
              {pending ? "Saving…" : "Save changes →"}
            </Button>
            <Button onClick={cancel}>Done</Button>
          </>
        )}
      </div>

      {error && (
        <p style={{ color: "var(--red)", fontFamily: "var(--font-mono), 'JetBrains Mono', monospace", fontSize: 12, margin: 0 }}>
          {error}
        </p>
      )}

      {zones.length > 0 && (
        <div style={{ border: "1px solid var(--rule)" }}>
          {zones.map((z, i) => (
            <div
              key={z.id}
              style={{
                padding: "14px 18px",
                display: "flex",
                alignItems: "center",
                gap: 16,
                borderTop: i === 0 ? "none" : "1px solid var(--rule)",
              }}
            >
              <span
                style={{
                  width: 12,
                  height: 12,
                  background: "rgba(233, 184, 100, 0.3)",
                  border: "1px solid var(--gold, #e9b864)",
                  flexShrink: 0,
                }}
              />
              <span style={{ fontFamily: "var(--font-serif), 'Instrument Serif', serif", fontSize: 19, flex: 1 }}>
                {z.label}
              </span>
              <span
                style={{
                  fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
                  fontSize: 11,
                  color: "var(--ink-2)",
                  letterSpacing: "0.1em",
                }}
              >
                {z.polygon.length} vertices
              </span>
              <Button onClick={() => startEdit(z)} disabled={pending}>
                Edit
              </Button>
              <Button onClick={() => void deleteZone(z.id)} disabled={pending}>
                Delete
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EditablePolygon({
  points,
  onGrab,
}: {
  points: PolygonPoint[];
  onGrab: (pointIndex: number) => void;
}) {
  return (
    <>
      <polygon
        points={points.map((p) => `${p.x},${p.y}`).join(" ")}
        fill="rgba(233, 184, 100, 0.28)"
        stroke="var(--gold, #e9b864)"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
      />
      {points.map((p, i) => (
        <Vertex key={i} point={p} onGrab={() => onGrab(i)} />
      ))}
    </>
  );
}

function Vertex({ point, onGrab }: { point: PolygonPoint; onGrab: () => void }) {
  // r is in viewBox units (0..1); non-scaling-stroke doesn't apply to radius,
  // so use a slightly generous hit target and a hairline visual.
  return (
    <circle
      cx={point.x}
      cy={point.y}
      r={0.012}
      fill="var(--gold, #e9b864)"
      stroke="#0a0a08"
      strokeWidth={1}
      vectorEffect="non-scaling-stroke"
      style={{ cursor: "grab" }}
      onMouseDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onGrab();
      }}
      onClick={(e) => e.stopPropagation()}
    />
  );
}
