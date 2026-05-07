import { redirect } from "next/navigation";
import { requireSession, listInvitesServer } from "@/lib/server-api";
import { InviteForm } from "./invite-form";

export const dynamic = "force-dynamic";

export default async function AdminInvitesPage() {
  const me = await requireSession();
  if (me.user.role !== "admin") redirect("/");
  const { invites } = await listInvitesServer();

  return (
    <section>
      <h1>Invites</h1>
      <p style={{ color: "var(--color-muted)" }}>
        Invite a new member to <strong>{me.user.email}</strong>&rsquo;s organization.
        They&rsquo;ll receive a one-time sign-in link.
      </p>

      <InviteForm organizationId={me.user.organizationId} />

      <h2 style={{ marginTop: 32 }}>Sent invites</h2>
      {invites.length === 0 && <p>No invites yet.</p>}
      <ul style={{ listStyle: "none", padding: 0 }}>
        {invites.map((i) => (
          <li
            key={i.id}
            style={{
              padding: 12,
              borderBottom: "1px solid var(--color-border)",
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <span>
              <strong>{i.email}</strong>
              <br />
              <small style={{ color: "var(--color-muted)" }}>
                role: {i.role} · sent {new Date(i.createdAt).toLocaleString()}
              </small>
            </span>
            <span style={{ color: i.consumedAt ? "green" : "var(--color-muted)" }}>
              {i.consumedAt ? "accepted" : "pending"}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
