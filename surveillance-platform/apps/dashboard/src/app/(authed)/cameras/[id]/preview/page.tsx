import Link from "next/link";
import { Eyebrow } from "@surveillance/ui";
import { listCamerasServer, requireSession } from "@/lib/server-api";
import { PreviewPlayer } from "@/app/_components/preview-player";

export const dynamic = "force-dynamic";

export default async function CameraPreviewPage({ params }: { params: { id: string } }) {
  const me = await requireSession();
  const { cameras } = await listCamerasServer();
  const camera = cameras.find((c) => c.id === params.id);
  const sitesHref = `/sites/${me.user.organizationId}/cameras`;

  if (!camera) {
    return (
      <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Link
          href={sitesHref}
          style={{
            color: "var(--ink-2)",
            textDecoration: "none",
            fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
            fontSize: 11,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
          }}
        >
          ← Cameras
        </Link>
        <h1
          style={{
            fontFamily: "var(--font-serif), 'Instrument Serif', serif",
            fontSize: 40,
            fontWeight: 400,
            margin: 0,
          }}
        >
          Camera not found
        </h1>
        <p style={{ color: "var(--ink-2)" }}>This camera doesn&rsquo;t exist or you don&rsquo;t have access.</p>
      </section>
    );
  }
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Link
        href={sitesHref}
        style={{
          color: "var(--ink-2)",
          textDecoration: "none",
          fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
          fontSize: 11,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
        }}
      >
        ← Cameras
      </Link>
      <div>
        <Eyebrow>Live preview</Eyebrow>
        <h1
          style={{
            fontFamily: "var(--font-serif), 'Instrument Serif', serif",
            fontSize: 44,
            letterSpacing: "-0.01em",
            fontWeight: 400,
            margin: "8px 0 4px",
          }}
        >
          {camera.label}
        </h1>
        <p
          style={{
            color: "var(--ink-2)",
            fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
            fontSize: 12,
            letterSpacing: "0.08em",
          }}
        >
          {camera.rtspUrl}
        </p>
      </div>
      <PreviewPlayer cameraId={camera.id} />
    </section>
  );
}
