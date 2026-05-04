import type { ConnectorStatus } from "@surveillance/shared";

const COLORS: Record<ConnectorStatus, { bg: string; fg: string; label: string }> = {
  pending: { bg: "#fef3c7", fg: "#92400e", label: "Pending" },
  online: { bg: "#dcfce7", fg: "#166534", label: "Online" },
  offline: { bg: "#fee2e2", fg: "#991b1b", label: "Offline" },
  revoked: { bg: "#e5e7eb", fg: "#374151", label: "Revoked" },
};

export function StatusBadge({ status }: { status: ConnectorStatus }) {
  const c = COLORS[status];
  return (
    <span
      style={{
        background: c.bg,
        color: c.fg,
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 500,
      }}
    >
      {c.label}
    </span>
  );
}
