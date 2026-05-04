import type { ReactNode } from "react";
import Link from "next/link";
import { UserBar } from "../_components/user-bar";
import { requireSession } from "@/lib/server-api";

export default async function AuthedLayout({ children }: { children: ReactNode }) {
  const me = await requireSession();
  return (
    <>
      <header
        style={{
          padding: "16px 24px",
          borderBottom: "1px solid var(--color-border)",
          background: "white",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Link href="/" style={{ color: "inherit", textDecoration: "none" }}>
          <strong>Surveillance Platform</strong>
        </Link>
        <UserBar email={me.user.email} />
      </header>
      <main style={{ maxWidth: 960, margin: "0 auto", padding: 24 }}>{children}</main>
    </>
  );
}
