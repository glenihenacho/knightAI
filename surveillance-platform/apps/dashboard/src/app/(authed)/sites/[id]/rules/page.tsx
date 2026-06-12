import {
  listCamerasServer,
  listConnectorsServer,
  listRulesServer,
  listSchedulesServer,
  listZonesServer,
} from "@/lib/server-api";
import { RulesManager } from "./rules-manager";

export const dynamic = "force-dynamic";

export default async function SiteRulesPage({ params }: { params: { id: string } }) {
  const [{ rules }, { schedules }, { cameras }, { connectors }] = await Promise.all([
    listRulesServer(params.id),
    listSchedulesServer(params.id),
    listCamerasServer(),
    listConnectorsServer(),
  ]);
  const siteConnectorIds = new Set(connectors.filter((c) => c.siteId === params.id).map((c) => c.id));
  const siteCameras = cameras.filter((cam) => siteConnectorIds.has(cam.connectorId));
  const zonesByCamera = await Promise.all(
    siteCameras.map(async (cam) => {
      const { zones } = await listZonesServer(cam.id);
      return { cameraId: cam.id, cameraLabel: cam.label, zones };
    }),
  );

  return (
    <RulesManager
      siteId={params.id}
      rules={rules}
      schedules={schedules}
      cameras={zonesByCamera}
    />
  );
}
