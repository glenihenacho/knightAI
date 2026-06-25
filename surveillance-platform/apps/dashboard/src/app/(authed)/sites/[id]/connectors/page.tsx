import type { Connector, ConnectorStatus } from "@surveillance/shared";
import { Eyebrow, StatusBadge } from "@surveillance/ui";
import { listConnectorsServer } from "@/lib/server-api";
import { WakeConnectorButton } from "@/app/_components/wake-connector-button";

export const dynamic = "force-dynamic";

// The connectors row is stamped "online" at redeem and never flipped back by
// the API; last_seen_at (refreshed while the command poll loop runs) is the
// live signal. A connector with no live cameras goes dormant to let the
// database suspend, so it reads as offline here — use Wake to bring it back.
// Treat an "online" connector whose last poll is older than this as offline so
// the badge reflects reality.
const ONLINE_STALE_MS = 90_000;

function effectiveStatus(c: Connector): ConnectorStatus {
  if (c.status === "online") {
    if (!c.lastSeenAt) return "offline";
    if (Date.now() - new Date(c.lastSeenAt).getTime() > ONLINE_STALE_MS) {
      return "offline";
    }
  }
  return c.status;
}

export default async function SiteConnectorsPage({ params }: { params: { id: string } }) {
  const { connectors: allConnectors } = await listConnectorsServer();
  const connectors = allConnectors.filter((c) => c.siteId === params.id);

  if (connectors.length === 0) {
    return (
      <div
        style={{
          padding: "48px 24px",
          border: "1px dashed var(--rule-2)",
          textAlign: "center",
        }}
      >
        <Eyebrow>No connectors paired</Eyebrow>
        <p style={{ color: "var(--ink-2)", marginTop: 12 }}>
          A connector is a small agent on the customer network. Click <strong>Pair connector</strong>
          {" "}above to generate a one-time code.
        </p>
      </div>
    );
  }

  return (
    <div style={{ border: "1px solid var(--rule)" }}>
      {connectors.map((c, i) => (
        <div
          key={c.id}
          style={{
            padding: "20px 24px",
            display: "grid",
            gridTemplateColumns: "1fr 1fr auto",
            alignItems: "center",
            gap: 16,
            borderBottom: i === connectors.length - 1 ? "none" : "1px solid var(--rule)",
          }}
        >
          <div>
            <div
              style={{
                fontFamily: "var(--font-serif), 'Instrument Serif', serif",
                fontSize: 22,
              }}
            >
              {c.label}
            </div>
            <div
              style={{
                fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
                fontSize: 11,
                letterSpacing: "0.1em",
                color: "var(--ink-2)",
                marginTop: 4,
              }}
            >
              {c.hostname ?? "—"}
              {c.platform && ` · ${c.platform}`}
              {c.version && ` · v${c.version}`}
            </div>
          </div>
          <div
            style={{
              fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
              fontSize: 11,
              letterSpacing: "0.1em",
              color: "var(--ink-2)",
            }}
          >
            {c.lastSeenAt
              ? `Last seen ${new Date(c.lastSeenAt).toLocaleString()}`
              : "Never seen"}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "flex-end" }}>
            <StatusBadge status={effectiveStatus(c)} />
            {effectiveStatus(c) === "offline" && <WakeConnectorButton connectorId={c.id} />}
          </div>
        </div>
      ))}
    </div>
  );
}
