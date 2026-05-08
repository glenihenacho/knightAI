interface CameraPreviewProps {
  label: string;
  snapshotUrl: string | null;
  capturedAt: string | null;
}

export function CameraPreview({ label, snapshotUrl, capturedAt }: CameraPreviewProps) {
  return (
    <figure style={{ margin: 0 }}>
      <div
        style={{
          aspectRatio: "16 / 9",
          background: "#0a0a08",
          border: "1px solid var(--rule)",
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--ink-2)",
          fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
          fontSize: 11,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
        }}
      >
        {snapshotUrl ? (
          <img
            src={snapshotUrl}
            alt={label}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <span>No snapshot yet</span>
        )}
      </div>
      <figcaption
        style={{
          marginTop: 10,
          fontSize: 13,
          color: "var(--ink-2)",
          display: "flex",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <strong style={{ color: "var(--ink)", fontWeight: 500 }}>{label}</strong>
        {capturedAt && (
          <span
            style={{
              fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
              fontSize: 10,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            {new Date(capturedAt).toLocaleString()}
          </span>
        )}
      </figcaption>
    </figure>
  );
}
