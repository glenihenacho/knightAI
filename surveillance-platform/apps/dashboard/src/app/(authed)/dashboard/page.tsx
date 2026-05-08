import Link from "next/link";
import { Eyebrow, SectionHead, Stat } from "@surveillance/ui";
import {
  listCamerasServer,
  listConnectorsServer,
  listOrganizationsServer,
  requireSession,
} from "@/lib/server-api";

export const dynamic = "force-dynamic";

export default async function DashboardOverviewPage() {
  const me = await requireSession();
  const [{ cameras }, { connectors }, { organizations }] = await Promise.all([
    listCamerasServer(),
    listConnectorsServer(),
    listOrganizationsServer(),
  ]);
  const org = organizations.find((o) => o.id === me.user.organizationId);
  const onlineConnectors = connectors.filter((c) => c.status === "online").length;

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 48 }}>
      <SectionHead
        eyebrow="Overview"
        num={org?.name ?? ""}
        title={
          <>
            Today&rsquo;s shift,{" "}
            <span style={{ color: "var(--gold)", fontStyle: "italic" }}>at a glance.</span>
          </>
        }
        intro="Phase 0 surfaces what's already wired: the connectors paired into your network, the cameras they validated, and where pairing happens. Behavior, Response, and Evidence light up in later phases."
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 0,
          border: "1px solid var(--rule)",
        }}
      >
        <StatCell>
          <Stat value={connectors.length} label="Connectors paired" />
        </StatCell>
        <StatCell>
          <Stat value={onlineConnectors} label="Connectors online" />
        </StatCell>
        <StatCell>
          <Stat value={cameras.length} label="Cameras configured" />
        </StatCell>
        <StatCell last>
          <Stat value="—" label="Events flagged today" />
        </StatCell>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 0,
          border: "1px solid var(--rule)",
        }}
      >
        <PillarTile
          eyebrow="Pillar 01"
          title="Site Logic"
          desc="Sites, zones, schedules, rules."
          href="/sites"
          state="active"
        />
        <PillarTile
          eyebrow="Pillar 02"
          title="Behavior Intelligence"
          desc="Dwell, re-entry, path deviation."
          href="/behavior"
          state="soon"
        />
        <PillarTile
          eyebrow="Pillar 03"
          title="Response Orchestration"
          desc="Routing, ack, escalation."
          href="/response"
          state="soon"
        />
        <PillarTile
          eyebrow="Pillar 04"
          title="Evidence Compiler"
          desc="Daily client-ready reports."
          href="/evidence"
          state="soon"
          last
        />
      </div>
    </section>
  );
}

function StatCell({ children, last }: { children: React.ReactNode; last?: boolean }) {
  return (
    <div
      style={{
        padding: "28px 24px",
        borderRight: last ? "none" : "1px solid var(--rule)",
      }}
    >
      {children}
    </div>
  );
}

function PillarTile({
  eyebrow,
  title,
  desc,
  href,
  state,
  last,
}: {
  eyebrow: string;
  title: string;
  desc: string;
  href: string;
  state: "active" | "soon";
  last?: boolean;
}) {
  return (
    <Link
      href={href}
      style={{
        padding: "28px 24px",
        borderRight: last ? "none" : "1px solid var(--rule)",
        textDecoration: "none",
        color: "inherit",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        transition: "background 0.2s ease",
        background: state === "soon" ? "rgba(168,160,142,0.02)" : "transparent",
      }}
    >
      <Eyebrow gold={state === "active"}>{eyebrow}</Eyebrow>
      <h3
        style={{
          fontFamily: "var(--font-serif), 'Instrument Serif', serif",
          fontSize: 28,
          letterSpacing: "-0.01em",
          fontWeight: 400,
          margin: 0,
        }}
      >
        {title}
      </h3>
      <p style={{ color: "var(--ink-2)", fontSize: 14, margin: 0 }}>{desc}</p>
      <span
        style={{
          marginTop: 8,
          fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
          fontSize: 10,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: state === "active" ? "var(--gold)" : "var(--ink-2)",
        }}
      >
        {state === "active" ? "Open →" : "Coming soon"}
      </span>
    </Link>
  );
}
