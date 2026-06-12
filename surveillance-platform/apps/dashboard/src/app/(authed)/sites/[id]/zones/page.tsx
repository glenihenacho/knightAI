import { Eyebrow } from "@surveillance/ui";
import { SNAPSHOT_URL } from "@/lib/api";
import { listCamerasServer, listConnectorsServer } from "@/lib/server-api";
import { ZonesManager } from "./zones-manager";

export const dynamic = "force-dynamic";

export default async function SiteZonesPage({ params }: { params: { id: string } }) {
  const [{ cameras }, { connectors }] = await Promise.all([
    listCamerasServer(),
    listConnectorsServer(),
  ]);
  const siteConnectorIds = new Set(connectors.filter((c) => c.siteId === params.id).map((c) => c.id));
  const siteCameras = cameras
    .filter((cam) => siteConnectorIds.has(cam.connectorId))
    .map((cam) => ({
      id: cam.id,
      label: cam.label,
      snapshotUrl: cam.lastSnapshotKey ? SNAPSHOT_URL(cam.lastSnapshotKey) : null,
    }));

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
          Zones are drawn on a camera frame. Pair a connector and add a camera first.
        </p>
      </div>
    );
  }

  return <ZonesManager cameras={siteCameras} />;
}
