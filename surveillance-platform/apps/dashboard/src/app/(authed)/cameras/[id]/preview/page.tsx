import Link from "next/link";
import { listCamerasServer } from "@/lib/server-api";
import { PreviewPlayer } from "@/app/_components/preview-player";

export const dynamic = "force-dynamic";

export default async function CameraPreviewPage({ params }: { params: { id: string } }) {
  const { cameras } = await listCamerasServer();
  const camera = cameras.find((c) => c.id === params.id);
  if (!camera) {
    return (
      <section>
        <h1>Camera not found</h1>
        <p>This camera doesn&rsquo;t exist or you don&rsquo;t have access.</p>
        <p><Link href="/cameras">Back to cameras</Link></p>
      </section>
    );
  }
  return (
    <section>
      <p style={{ marginBottom: 8 }}>
        <Link href="/cameras" style={{ fontSize: 14, color: "var(--color-muted)" }}>
          &larr; Cameras
        </Link>
      </p>
      <h1 style={{ marginTop: 0 }}>{camera.label}</h1>
      <p style={{ color: "var(--color-muted)", fontSize: 14, marginTop: -8 }}>
        {camera.rtspUrl}
      </p>
      <PreviewPlayer cameraId={camera.id} />
    </section>
  );
}
