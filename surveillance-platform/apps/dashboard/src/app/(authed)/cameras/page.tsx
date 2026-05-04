import Link from "next/link";
import { CameraPreview } from "@surveillance/ui";
import { SNAPSHOT_URL } from "@/lib/api";
import { listCamerasServer } from "@/lib/server-api";

export const dynamic = "force-dynamic";

export default async function CamerasPage() {
  const { cameras } = await listCamerasServer();
  return (
    <section>
      <h1>Cameras</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
        {cameras.map((cam) => (
          <div key={cam.id} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <CameraPreview
              label={cam.label}
              snapshotUrl={cam.lastSnapshotKey ? SNAPSHOT_URL(cam.lastSnapshotKey) : null}
              capturedAt={cam.lastValidatedAt}
            />
            <Link
              href={`/cameras/${cam.id}/preview`}
              style={{
                fontSize: 13,
                padding: "6px 10px",
                background: "white",
                border: "1px solid var(--color-border)",
                borderRadius: 4,
                textAlign: "center",
                textDecoration: "none",
                color: "inherit",
              }}
            >
              Watch live
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}
