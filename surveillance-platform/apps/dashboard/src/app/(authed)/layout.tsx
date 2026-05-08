import type { ReactNode } from "react";
import Link from "next/link";
import { UserBar } from "../_components/user-bar";
import { requireSession } from "@/lib/server-api";

export default async function AuthedLayout({ children }: { children: ReactNode }) {
  const me = await requireSession();
  const isAdmin = me.user.role === "admin";

  return (
    <>
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          padding: "0 24px",
          height: 64,
          borderBottom: "1px solid var(--rule)",
          background: "rgba(10, 10, 8, 0.85)",
          backdropFilter: "blur(10px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 36 }}>
          <Link
            href="/dashboard"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              color: "var(--ink)",
              textDecoration: "none",
              fontFamily: "var(--font-serif), 'Instrument Serif', serif",
              fontSize: 20,
              letterSpacing: "-0.01em",
            }}
          >
            <Crest />
            GoldCrusade
          </Link>
          <nav style={{ display: "flex", gap: 24 }}>
            <NavLink href="/sites">Sites</NavLink>
            <NavLink href="/behavior">Behavior</NavLink>
            <NavLink href="/response">Response</NavLink>
            <NavLink href="/evidence">Evidence</NavLink>
            {isAdmin && <NavLink href="/admin/invites">Admin</NavLink>}
          </nav>
        </div>
        <UserBar email={me.user.email} />
      </header>
      <main style={{ maxWidth: 1240, margin: "0 auto", padding: "32px 28px 80px" }}>
        {children}
      </main>
    </>
  );
}

function NavLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      style={{
        color: "var(--ink-2)",
        textDecoration: "none",
        fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
        fontSize: 12,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        transition: "color 0.2s ease",
      }}
    >
      {children}
    </Link>
  );
}

function Crest() {
  return (
    <span
      style={{
        width: 18,
        height: 18,
        display: "inline-block",
        background:
          "linear-gradient(100deg, var(--gold-2) 0%, var(--gold) 30%, var(--gold-3) 48%, #fff 50%, var(--gold-3) 52%, var(--gold) 70%, var(--gold-2) 100%)",
        clipPath: "polygon(50% 0%, 90% 30%, 90% 70%, 50% 100%, 10% 70%, 10% 30%)",
      }}
    />
  );
}
