import Link from "next/link";
import { SectionHead, StatusBadge, Table } from "@surveillance/ui";
import { listCamerasServer, listConnectorsServer, listSitesServer } from "@/lib/server-api";
import { AddSiteButton } from "./_components/add-site-button";

export const dynamic = "force-dynamic";

const COLUMNS = "1.4fr 1fr 1fr 1fr auto";

export default async function SitesPage() {
  const [{ sites }, { cameras }, { connectors }] = await Promise.all([
    listSitesServer(),
    listCamerasServer(),
    listConnectorsServer(),
  ]);

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
        intro="A site is one physical location: its connectors, cameras, zones, schedules, and the rules that bind them. Open a site to draw zones and wire up rules."
      />

      <div>
        <AddSiteButton />
      </div>

      <Table columns={["Site", "Timezone", "Cameras", "Connectors", "Status"]} templateColumns={COLUMNS}>
        {sites.map((site, i) => {
          const siteConnectors = connectors.filter((c) => c.siteId === site.id);
          const connectorIds = new Set(siteConnectors.map((c) => c.id));
          const siteCameras = cameras.filter((cam) => connectorIds.has(cam.connectorId));
          const online = siteConnectors.filter((c) => c.status === "online").length;
          const aggregateStatus =
            siteConnectors.length === 0
              ? "pending"
              : online === siteConnectors.length
              ? "online"
              : "offline";
          return (
            <Link
              key={site.id}
              href={`/sites/${site.id}`}
              style={{
                padding: "20px",
                display: "grid",
                gridTemplateColumns: COLUMNS,
                gap: 16,
                alignItems: "center",
                textDecoration: "none",
                color: "inherit",
                borderTop: i === 0 ? "none" : "1px solid var(--rule)",
                transition: "background 0.2s ease",
              }}
            >
              <div
                style={{
                  fontFamily: "var(--font-serif), 'Instrument Serif', serif",
                  fontSize: 24,
                  lineHeight: 1.1,
                }}
              >
                {site.label}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
                  fontSize: 11,
                  letterSpacing: "0.1em",
                  color: "var(--ink-2)",
                }}
              >
                {site.timezone}
              </div>
              <div style={{ fontFamily: "var(--font-serif), 'Instrument Serif', serif", fontSize: 28, color: "var(--gold)" }}>
                {siteCameras.length}
              </div>
              <div style={{ fontFamily: "var(--font-serif), 'Instrument Serif', serif", fontSize: 28, color: "var(--gold)" }}>
                {siteConnectors.length}
              </div>
              <StatusBadge status={aggregateStatus} />
            </Link>
          );
        })}
      </Table>
    </section>
  );
}
