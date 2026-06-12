import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Eyebrow } from "@surveillance/ui";
import { getSiteServer } from "@/lib/server-api";

const TABS = [
  { href: "cameras", label: "Cameras" },
  { href: "connectors", label: "Connectors" },
  { href: "zones", label: "Zones" },
  { href: "schedules", label: "Schedules" },
  { href: "rules", label: "Rules" },
] as const;

export default async function SiteLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { id: string };
}) {
  const site = await getSiteServer(params.id);
  if (!site) notFound();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <div>
        <Link
          href="/sites"
          style={{
            color: "var(--ink-2)",
            textDecoration: "none",
            fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
            fontSize: 11,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
          }}
        >
          ← Sites
        </Link>
        <h1
          style={{
            fontFamily: "var(--font-serif), 'Instrument Serif', serif",
            fontSize: 48,
            letterSpacing: "-0.02em",
            fontWeight: 400,
            margin: "12px 0 4px",
          }}
        >
          {site.label}
        </h1>
        <Eyebrow>Site detail · {site.timezone}</Eyebrow>
      </div>

      <nav
        style={{
          display: "flex",
          gap: 0,
          borderBottom: "1px solid var(--rule)",
        }}
      >
        {TABS.map((t) => (
          <SiteTab key={t.href} href={`/sites/${params.id}/${t.href}`}>
            {t.label}
          </SiteTab>
        ))}
        <div style={{ flex: 1 }} />
        <Link
          href={`/sites/${params.id}/connect`}
          style={{
            alignSelf: "center",
            padding: "10px 16px",
            border: "1px solid rgba(233,184,100,.4)",
            background: "white",
            color: "#1a1305",
            textDecoration: "none",
            fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
            fontSize: 11,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            fontWeight: 500,
            marginBottom: 8,
          }}
        >
          + Pair connector
        </Link>
      </nav>

      <div>{children}</div>
    </div>
  );
}

function SiteTab({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      style={{
        padding: "12px 18px",
        textDecoration: "none",
        color: "var(--ink)",
        fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
        fontSize: 12,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        cursor: "pointer",
        borderBottom: "1px solid transparent",
        marginBottom: -1,
      }}
    >
      {children}
    </Link>
  );
}
