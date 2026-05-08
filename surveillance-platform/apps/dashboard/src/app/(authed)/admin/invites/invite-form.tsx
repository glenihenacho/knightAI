"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { UserRole } from "@surveillance/shared";
import { api } from "@/lib/api";

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "10px 12px",
  marginTop: 6,
  border: "1px solid var(--rule-2)",
  background: "rgba(255,255,255,0.02)",
  color: "var(--ink)",
  fontSize: 14,
};

const labelStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
  fontSize: 11,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "var(--ink-2)",
};

export function InviteForm({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("client");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setSentTo(null);
    try {
      await api.createInvite({ email, organizationId, role });
      setSentTo(email);
      setEmail("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      style={{
        display: "grid",
        gap: 16,
        maxWidth: 520,
        padding: 24,
        border: "1px solid var(--rule)",
      }}
    >
      <label style={labelStyle}>
        Email
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={inputStyle}
        />
      </label>
      <label style={labelStyle}>
        Role
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as UserRole)}
          style={inputStyle}
        >
          <option value="client">Client</option>
          <option value="admin">Admin</option>
        </select>
      </label>
      <button
        type="submit"
        disabled={pending || email.length === 0}
        style={{
          alignSelf: "flex-start",
          padding: "12px 18px",
          background: "white",
          color: "#1a1305",
          border: "1px solid rgba(233,184,100,.4)",
          fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
          fontSize: 11,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          fontWeight: 500,
          cursor: pending ? "default" : "pointer",
          opacity: pending || email.length === 0 ? 0.6 : 1,
        }}
      >
        {pending ? "Sending…" : "Send invite →"}
      </button>
      {error && (
        <p style={{ color: "var(--red)", fontFamily: "var(--font-mono), 'JetBrains Mono', monospace", fontSize: 12 }}>
          {error}
        </p>
      )}
      {sentTo && (
        <p style={{ color: "var(--green)", fontFamily: "var(--font-mono), 'JetBrains Mono', monospace", fontSize: 12 }}>
          Invite sent to <strong>{sentTo}</strong>.
        </p>
      )}
    </form>
  );
}
