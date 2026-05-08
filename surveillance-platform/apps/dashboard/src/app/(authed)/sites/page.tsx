import Link from "next/link";
import { Eyebrow, SectionHead, StatusBadge } from "@surveillance/ui";
import {
  listCamerasServer,
  listConnectorsServer,
  listOrganizationsServer,
  requireSession,
} from "@/lib/server-api";

export const dynamic = "force-dynamic";

export default async function SitesPage() {
  const me = await requireSession();
  const [{ cameras }, { connectors }, { organizations }] = await Promise.all([
    listCamerasServer(),
    listConnectorsServer(),
    listOrganizationsServer(),
  ]);
  const org = organizations.find((o) => o.id === me.user.organizationId);

  // Phase 0: synthesize a single pseudo-site from the org's cameras + connectors.
  // The real `sites` table arrives in Phase 1.
  const siteId = me.user.organizationId;
  const siteName = org?.name ?? "Default site";
  const onlineConnectors = connectors.filter((c) => c.status === "online").length;
  const aggregateStatus =
    connectors.length === 0
      ? "pending"
      : onlineConnectors === connectors.length
      ? "online"
      : "offline";

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      <SectionHead
        eyebrow="Pillar 01 / Site Logic"
        num="Sites"
        title={
          <>
            Each property gets its own{" "}
            <span style={{ color: "var(--gold)", fontStyle: "italic" }}>operating logic.</span>
          </>
        }
        intro="In Phase 0 every org maps to a single site. Phase 1 adds zones, schedules, and rules per site, and the polygon editor for camera-frame zones."
      />

      <div style={{ border: "1px solid var(--rule)" }}>
        <div
          style={{
            padding: "14px 20px",
            borderBottom: "1px solid var(--rule)",
            display: "grid",
            gridTemplateColumns: "1.4fr 1fr 1fr auto",
            gap: 16,
            alignItems: "center",
            fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
            fontSize: 10,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "var(--ink-2)",
          }}
        >
          <span>Site</span>
          <span>Cameras</span>
          <span>Connectors</span>
          <span>Status</span>
        </div>
        <Link
          href={`/sites/${siteId}`}
          style={{
            padding: "20px",
            display: "grid",
            gridTemplateColumns: "1.4fr 1fr 1fr auto",
            gap: 16,
            alignItems: "center",
            textDecoration: "none",
            color: "inherit",
            transition: "background 0.2s ease",
          }}
        >
          <div>
            <div
              style={{
                fontFamily: "var(--font-serif), 'Instrument Serif', serif",
                fontSize: 24,
                lineHeight: 1.1,
              }}
            >
              {siteName}
            </div>
            <div style={{ color: "var(--ink-2)", fontSize: 13, marginTop: 4 }}>
              Synthesized site — Phase 1 introduces real site records.
            </div>
          </div>
          <div style={{ fontFamily: "var(--font-serif), 'Instrument Serif', serif", fontSize: 28, color: "var(--gold)" }}>
            {cameras.length}
          </div>
          <div style={{ fontFamily: "var(--font-serif), 'Instrument Serif', serif", fontSize: 28, color: "var(--gold)" }}>
            {connectors.length}
          </div>
          <StatusBadge status={aggregateStatus} />
        </Link>
      </div>

      <p style={{ color: "var(--ink-2)", fontSize: 13 }}>
        <Eyebrow>Soon</Eyebrow>
        <br />
        Multi-site organizations land alongside the Site Logic Engine. For now, every connector and
        camera you pair lives under <strong style={{ color: "var(--ink)" }}>{siteName}</strong>.
      </p>
    </section>
  );
}
