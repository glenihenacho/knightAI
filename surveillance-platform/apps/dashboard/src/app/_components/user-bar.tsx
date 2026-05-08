"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

export function UserBar({ email }: { email: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);
    try {
      await api.logout();
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <span
        style={{
          fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
          fontSize: 11,
          letterSpacing: "0.1em",
          color: "var(--ink-2)",
        }}
      >
        {email}
      </span>
      <button
        type="button"
        onClick={logout}
        disabled={pending}
        style={{
          padding: "6px 12px",
          background: "transparent",
          border: "1px solid var(--rule-2)",
          color: "var(--ink-2)",
          fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
          fontSize: 10,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          cursor: pending ? "default" : "pointer",
        }}
      >
        {pending ? "Signing out…" : "Sign out"}
      </button>
    </div>
  );
}
