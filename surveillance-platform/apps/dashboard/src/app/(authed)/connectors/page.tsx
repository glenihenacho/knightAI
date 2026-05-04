import { StatusBadge } from "@surveillance/ui";
import { listConnectorsServer } from "@/lib/server-api";

export const dynamic = "force-dynamic";

export default async function ConnectorsPage() {
  const { connectors } = await listConnectorsServer();
  return (
    <section>
      <h1>Connectors</h1>
      {connectors.length === 0 && <p>No connectors paired yet.</p>}
      <ul style={{ listStyle: "none", padding: 0 }}>
        {connectors.map((c) => (
          <li
            key={c.id}
            style={{
              padding: 12,
              borderBottom: "1px solid var(--color-border)",
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <span>
              <strong>{c.label}</strong>
              <br />
              <small style={{ color: "var(--color-muted)" }}>{c.hostname ?? "—"}</small>
            </span>
            <StatusBadge status={c.status} />
          </li>
        ))}
      </ul>
    </section>
  );
}
