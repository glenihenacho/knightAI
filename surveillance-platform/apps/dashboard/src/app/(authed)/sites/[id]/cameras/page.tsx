import Link from "next/link";
import { CameraPreview, Eyebrow } from "@surveillance/ui";
import { SNAPSHOT_URL } from "@/lib/api";
import { listCamerasServer, listConnectorsServer } from "@/lib/server-api";

export const dynamic = "force-dynamic";

export default async function SiteCamerasPage({ params }: { params: { id: string } }) {
  const [{ cameras }, { connectors }] = await Promise.all([
    listCamerasServer(),
    listConnectorsServer(),
  ]);
  // Cameras inherit their site through the connector they're registered on.
  const siteConnectorIds = new Set(connectors.filter((c) => c.siteId === params.id).map((c) => c.id));
  const siteCameras = cameras.filter((cam) => siteConnectorIds.has(cam.connectorId));

  if (siteCameras.length === 0) {
    return (
      <div
        style={{
          padding: "48px 24px",
          border: "1px dashed var(--rule-2)",
          textAlign: "center",
        }}
      >
        <Eyebrow>No cameras yet</Eyebrow>
        <p style={{ color: "var(--ink-2)", marginTop: 12 }}>
          Pair a connector at this site first, then add cameras to it.
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
        gap: 24,
      }}
    >
      {siteCameras.map((cam) => (
        <div key={cam.id} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <CameraPreview
            label={cam.label}
            snapshotUrl={cam.lastSnapshotKey ? SNAPSHOT_URL(cam.lastSnapshotKey) : null}
            capturedAt={cam.lastValidatedAt}
          />
          <Link
            href={`/cameras/${cam.id}/preview`}
            style={{
              fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
              fontSize: 11,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              padding: "10px 14px",
              border: "1px solid var(--rule-2)",
              background: "transparent",
              color: "var(--ink)",
              textAlign: "center",
              textDecoration: "none",
              transition: "border-color 0.2s ease, color 0.2s ease",
            }}
          >
            Watch live →
          </Link>
        </div>
      ))}
    </div>
  );
}
