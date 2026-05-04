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
      // Whether logout succeeded or not, send the user to /login. Middleware
      // will keep them there until they get a fresh cookie.
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 14 }}>
      <span style={{ color: "var(--color-muted)" }}>{email}</span>
      <button
        type="button"
        onClick={logout}
        disabled={pending}
        style={{
          padding: "4px 10px",
          fontSize: 13,
          background: "white",
          border: "1px solid var(--color-border)",
          borderRadius: 4,
          cursor: pending ? "default" : "pointer",
        }}
      >
        {pending ? "Signing out..." : "Sign out"}
      </button>
    </div>
  );
}
