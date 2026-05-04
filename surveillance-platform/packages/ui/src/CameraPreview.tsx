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
          background: "#0f172a",
          borderRadius: 8,
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#94a3b8",
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
      <figcaption style={{ marginTop: 8, fontSize: 13, color: "#475569" }}>
        <strong>{label}</strong>
        {capturedAt ? ` · ${new Date(capturedAt).toLocaleString()}` : ""}
      </figcaption>
    </figure>
  );
}
