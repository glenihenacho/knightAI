import type {
  Camera,
  Connector,
  CreateCameraRequest,
  CreatePairingResponse,
} from "@surveillance/shared";

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`api ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

export const api = {
  createPairing: (organizationId: string) =>
    fetch(`${BASE}/v1/pairings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ organizationId }),
    }).then((r) => json<CreatePairingResponse>(r)),

  listConnectors: () =>
    fetch(`${BASE}/v1/connectors`).then((r) => json<{ connectors: Connector[] }>(r)),

  listCameras: () =>
    fetch(`${BASE}/v1/cameras`).then((r) => json<{ cameras: Camera[] }>(r)),

  createCamera: (req: CreateCameraRequest) =>
    fetch(`${BASE}/v1/cameras`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
    }).then((r) => json<{ camera: Camera; queuedCommandId: string }>(r)),
};

export const SNAPSHOT_URL = (key: string) => `${BASE}/v1/snapshots/${encodeURIComponent(key)}`;
