import type { ConnectorStatus } from "@surveillance/shared";

type Style = { bg: string; fg: string; label: string };

const COLORS: Record<ConnectorStatus, Style> = {
  pending: { bg: "rgba(233,184,100,0.12)", fg: "var(--gold)", label: "Pending" },
  online: { bg: "rgba(154,208,122,0.14)", fg: "var(--green)", label: "Online" },
  offline: { bg: "rgba(255,90,77,0.14)", fg: "var(--red)", label: "Offline" },
  revoked: { bg: "rgba(168,160,142,0.12)", fg: "var(--ink-2)", label: "Revoked" },
};

export function StatusBadge({ status }: { status: ConnectorStatus }) {
  const c: Style = COLORS[status];
  return (
    <span
      style={{
        background: c.bg,
        color: c.fg,
        padding: "3px 10px",
        borderRadius: 999,
        fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
        fontSize: 10,
        fontWeight: 500,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        border: `1px solid ${c.bg}`,
      }}
    >
      {c.label}
    </span>
  );
}
