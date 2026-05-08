import { redirect } from "next/navigation";
import { Eyebrow, SectionHead, StatusBadge } from "@surveillance/ui";
import { requireSession, listInvitesServer } from "@/lib/server-api";
import { InviteForm } from "./invite-form";

export const dynamic = "force-dynamic";

export default async function AdminInvitesPage() {
  const me = await requireSession();
  if (me.user.role !== "admin") redirect("/dashboard");
  const { invites } = await listInvitesServer();

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      <SectionHead
        eyebrow="Admin"
        num="Invites"
        title={
          <>
            Bring teammates and{" "}
            <span style={{ color: "var(--gold)", fontStyle: "italic" }}>clients in.</span>
          </>
        }
        intro={`Issue a one-time sign-in link for ${me.user.email}'s organization. Admins can do everything; clients have operator privileges (pairing, cameras, live preview) but cannot send invites or create orgs.`}
      />

      <InviteForm organizationId={me.user.organizationId} />

      <div>
        <Eyebrow>Sent invites</Eyebrow>
        {invites.length === 0 && (
          <p style={{ color: "var(--ink-2)", marginTop: 12 }}>No invites yet.</p>
        )}
        <div style={{ marginTop: 16, border: invites.length > 0 ? "1px solid var(--rule)" : "none" }}>
          {invites.map((i, idx) => (
            <div
              key={i.id}
              style={{
                padding: "16px 20px",
                display: "grid",
                gridTemplateColumns: "1fr auto auto",
                gap: 16,
                alignItems: "center",
                borderBottom: idx === invites.length - 1 ? "none" : "1px solid var(--rule)",
              }}
            >
              <div>
                <div style={{ fontSize: 15, fontWeight: 500 }}>{i.email}</div>
                <div
                  style={{
                    fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
                    fontSize: 10,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: "var(--ink-2)",
                    marginTop: 4,
                  }}
                >
                  Role {i.role} · sent {new Date(i.createdAt).toLocaleString()}
                </div>
              </div>
              <span
                style={{
                  fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
                  fontSize: 11,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: i.consumedAt ? "var(--green)" : "var(--ink-2)",
                }}
              >
                {i.consumedAt ? "accepted" : "pending"}
              </span>
              <StatusBadge status={i.consumedAt ? "online" : "pending"} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
