"use client";

import { useCallback, useEffect, useState } from "react";
import type { Zone } from "@surveillance/shared";
import { Eyebrow } from "@surveillance/ui";
import { api } from "@/lib/api";
import { ZoneEditor } from "../../../_components/zone-editor";

interface CameraSummary {
  id: string;
  label: string;
  snapshotUrl: string | null;
}

export function ZonesManager({ cameras }: { cameras: CameraSummary[] }) {
  const [selectedId, setSelectedId] = useState(cameras[0]!.id);
  const [zones, setZones] = useState<Zone[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selected = cameras.find((c) => c.id === selectedId) ?? cameras[0]!;

  const refresh = useCallback(async () => {
    try {
      const { zones } = await api.listZones(selectedId);
      setZones(zones);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [selectedId]);

  useEffect(() => {
    setZones(null);
    void refresh();
  }, [refresh]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 28, alignItems: "start" }}>
      <div style={{ border: "1px solid var(--rule)" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--rule)" }}>
          <Eyebrow>Cameras</Eyebrow>
        </div>
        {cameras.map((cam) => (
          <button
            key={cam.id}
            type="button"
            onClick={() => setSelectedId(cam.id)}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              padding: "14px 16px",
              background: cam.id === selectedId ? "rgba(233,184,100,0.08)" : "transparent",
              border: "none",
              borderLeft:
                cam.id === selectedId ? "2px solid var(--gold, #e9b864)" : "2px solid transparent",
              color: "var(--ink)",
              fontFamily: "var(--font-serif), 'Instrument Serif', serif",
              fontSize: 18,
              cursor: "pointer",
            }}
          >
            {cam.label}
          </button>
        ))}
      </div>

      <div>
        {error && (
          <p style={{ color: "var(--red)", fontFamily: "var(--font-mono), 'JetBrains Mono', monospace", fontSize: 12 }}>
            {error}
          </p>
        )}
        {zones === null ? (
          <Eyebrow>Loading zones…</Eyebrow>
        ) : (
          <ZoneEditor
            cameraId={selected.id}
            snapshotUrl={selected.snapshotUrl}
            zones={zones}
            onChanged={() => void refresh()}
          />
        )}
      </div>
    </div>
  );
}
