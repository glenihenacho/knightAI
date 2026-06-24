"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { OnvifDevice } from "@surveillance/shared";
import { api } from "@/lib/api";

// Build a starter RTSP URL from a discovered device. The ONVIF generic path is
// a reasonable default; the operator edits credentials (and the path, if their
// camera differs) before saving.
function rtspFromDevice(d: OnvifDevice): string {
  return `rtsp://USERNAME:PASSWORD@${d.address}:554/onvif/profile1`;
}

const SCAN_POLL_MS = 1500;
const SCAN_GIVE_UP_MS = 20_000;

type ScanState =
  | { phase: "idle" }
  | { phase: "scanning" }
  | { phase: "done"; devices: OnvifDevice[] }
  | { phase: "error"; message: string };

export function AddCameraPanel({ connectorId }: { connectorId: string }) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [rtspUrl, setRtspUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scan, setScan] = useState<ScanState>({ phase: "idle" });

  async function runScan() {
    setScan({ phase: "scanning" });
    setError(null);
    try {
      const { commandId } = await api.startDiscovery(connectorId);
      const deadline = Date.now() + SCAN_GIVE_UP_MS;
      // Poll until the connector posts a result (status "done") or we give up.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        await new Promise((r) => setTimeout(r, SCAN_POLL_MS));
        const res = await api.getDiscovery(connectorId, commandId);
        if (res.status === "done") {
          setScan({ phase: "done", devices: res.devices });
          return;
        }
        if (res.status === "failed") {
          setScan({ phase: "error", message: res.errorMessage ?? "scan failed" });
          return;
        }
        if (Date.now() > deadline) {
          setScan({
            phase: "error",
            message: "Scan timed out — is the connector online and on the camera LAN?",
          });
          return;
        }
      }
    } catch (e) {
      setScan({ phase: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  function pickDevice(d: OnvifDevice) {
    setRtspUrl(rtspFromDevice(d));
    if (!label) setLabel(d.name ?? d.hardware ?? d.address);
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      await api.createCamera({ connectorId, label, rtspUrl });
      setLabel("");
      setRtspUrl("");
      setScan({ phase: "idle" });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: 10,
    fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
    fontSize: 13,
    border: "1px solid var(--rule-2)",
    background: "transparent",
    color: "var(--ink)",
  };

  return (
    <section
      style={{
        border: "1px solid var(--rule)",
        padding: 24,
        marginBottom: 24,
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <strong style={{ fontFamily: "var(--font-serif), serif", fontSize: 22 }}>Add a camera</strong>
        <button type="button" onClick={runScan} disabled={scan.phase === "scanning"}>
          {scan.phase === "scanning" ? "Scanning…" : "Scan for cameras (ONVIF)"}
        </button>
      </div>

      {scan.phase === "scanning" && (
        <p style={{ color: "var(--ink-2)", fontSize: 13 }}>
          Probing the connector&apos;s LAN for ONVIF cameras… (cameras must be on the same network;
          guest/AP-isolated WiFi won&apos;t respond)
        </p>
      )}
      {scan.phase === "error" && (
        <p style={{ color: "var(--red)", fontSize: 13 }}>{scan.message}</p>
      )}
      {scan.phase === "done" && (
        <div>
          {scan.devices.length === 0 ? (
            <p style={{ color: "var(--ink-2)", fontSize: 13 }}>
              No ONVIF cameras answered. Enter the RTSP URL manually below, or check the camera is
              ONVIF-enabled and on this LAN.
            </p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              {scan.devices.map((d) => (
                <li
                  key={d.address}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}
                >
                  <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 13 }}>
                    {d.name ?? d.hardware ?? "ONVIF device"} — {d.address}
                  </span>
                  <button type="button" onClick={() => pickDevice(d)}>
                    Use this
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <label style={{ display: "block" }}>
        <span style={{ fontSize: 12, color: "var(--ink-2)" }}>Label</span>
        <input style={inputStyle} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Front entrance" />
      </label>
      <label style={{ display: "block" }}>
        <span style={{ fontSize: 12, color: "var(--ink-2)" }}>RTSP URL</span>
        <input
          style={inputStyle}
          value={rtspUrl}
          onChange={(e) => setRtspUrl(e.target.value)}
          placeholder="rtsp://user:pass@192.168.1.50:554/onvif/profile1"
        />
      </label>

      {error && <p style={{ color: "var(--red)", fontSize: 13 }}>{error}</p>}

      <button
        type="button"
        onClick={submit}
        disabled={submitting || !label || !rtspUrl}
        style={{ alignSelf: "flex-start" }}
      >
        {submitting ? "Adding…" : "Add camera"}
      </button>
    </section>
  );
}
