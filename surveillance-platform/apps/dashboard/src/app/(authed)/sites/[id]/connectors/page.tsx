import { Eyebrow, StatusBadge } from "@surveillance/ui";
import { listConnectorsServer } from "@/lib/server-api";

export const dynamic = "force-dynamic";

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
          <StatusBadge status={c.status} />
        </div>
      ))}
    </div>
  );
}
