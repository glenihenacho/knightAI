import type { Event as EventRecord } from "@surveillance/shared";
import { Eyebrow } from "@surveillance/ui";
import { listEventsServer, listSitesServer, requireSession } from "@/lib/server-api";
import { EventsFeed } from "./events-feed";

export const dynamic = "force-dynamic";

export default async function BehaviorPage() {
  await requireSession();
  const [{ events }, { sites }] = await Promise.all([
    listEventsServer({ limit: 200 }),
    listSitesServer(),
  ]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      <KpiRow events={events} />
      <EventsFeed initialEvents={events.slice(0, 50)} sites={sites} />
    </div>
  );
}

// Snapshot KPIs over the most recent 200 events — enough for a pilot-scale
// "what happened today" glance without a dedicated aggregate endpoint.
function KpiRow({ events }: { events: EventRecord[] }) {
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const recent = events.filter((ev) => Date.parse(ev.occurredAt) >= dayAgo);
  const by = (pick: (ev: EventRecord) => string) =>
    recent.reduce<Record<string, number>>((acc, ev) => {
      const k = pick(ev);
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {});
  const severities = by((ev) => ev.severity);
  const triggers = by((ev) => ev.triggerType);

  const cells: Array<{ label: string; value: string }> = [
    { label: "Events / 24h", value: String(recent.length) },
    { label: "High severity", value: String(severities.high ?? 0) },
    {
      label: "By trigger",
      value:
        Object.entries(triggers)
          .map(([k, v]) => `${k.replaceAll("_", " ")} ${v}`)
          .join(" · ") || "—",
    },
  ];

  return (
    <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
      {cells.map((c) => (
        <div
          key={c.label}
          style={{
            border: "1px solid var(--rule-2)",
            padding: "16px 24px",
            minWidth: 160,
          }}
        >
          <Eyebrow>{c.label}</Eyebrow>
          <div
            style={{
              fontFamily: "var(--font-serif), 'Instrument Serif', serif",
              fontSize: 28,
              marginTop: 8,
            }}
          >
            {c.value}
          </div>
        </div>
      ))}
    </div>
  );
}
