import { CameraPreview } from "@surveillance/ui";
import { api, SNAPSHOT_URL } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function CamerasPage() {
  const { cameras } = await api.listCameras();
  return (
    <section>
      <h1>Cameras</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
        {cameras.map((cam) => (
          <CameraPreview
            key={cam.id}
            label={cam.label}
            snapshotUrl={cam.lastSnapshotKey ? SNAPSHOT_URL(cam.lastSnapshotKey) : null}
            capturedAt={cam.lastValidatedAt}
          />
        ))}
      </div>
    </section>
  );
}
