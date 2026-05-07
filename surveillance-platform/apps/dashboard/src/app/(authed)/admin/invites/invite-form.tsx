"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { UserRole } from "@surveillance/shared";
import { api } from "@/lib/api";

export function InviteForm({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("member");
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
      style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 480 }}
    >
      <label>
        Email
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{
            display: "block",
            width: "100%",
            padding: 8,
            marginTop: 4,
            border: "1px solid var(--color-border)",
            borderRadius: 4,
          }}
        />
      </label>
      <label>
        Role
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as UserRole)}
          style={{
            display: "block",
            width: "100%",
            padding: 8,
            marginTop: 4,
            border: "1px solid var(--color-border)",
            borderRadius: 4,
          }}
        >
          <option value="member">Member</option>
          <option value="admin">Admin</option>
        </select>
      </label>
      <button type="submit" disabled={pending || email.length === 0}>
        {pending ? "Sending..." : "Send invite"}
      </button>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      {sentTo && (
        <p style={{ color: "green" }}>
          Invite sent to <strong>{sentTo}</strong>.
        </p>
      )}
    </form>
  );
}
