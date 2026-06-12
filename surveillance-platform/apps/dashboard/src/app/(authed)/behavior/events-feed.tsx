"use client";

import { useCallback, useEffect, useState } from "react";
import type { Event as EventRecord, Severity, Site } from "@surveillance/shared";
import { Button, Eyebrow, Select, Table, TableRow } from "@surveillance/ui";
import { api, SNAPSHOT_URL } from "@/lib/api";
import { EventClipModal } from "@/app/_components/event-clip-player";

const COLUMNS = "0.9fr 1.2fr 1fr 1fr 0.8fr 0.6fr auto";
const POLL_MS = 10_000;
const PAGE_SIZE = 50;

export function EventsFeed({
  initialEvents,
  sites,
  fixedSiteId,
  compact = false,
}: {
  initialEvents: EventRecord[];
  sites: Site[];
  /** Pin the feed to one site (per-site Events tab) — hides the site filter. */
  fixedSiteId?: string;
  /** Drop the page header when embedded in a site tab. */
  compact?: boolean;
}) {
  const [events, setEvents] = useState<EventRecord[]>(initialEvents);
  const [siteId, setSiteId] = useState(fixedSiteId ?? "");
  const [openEvent, setOpenEvent] = useState<EventRecord | null>(null);
  const [severity, setSeverity] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [exhausted, setExhausted] = useState(initialEvents.length < PAGE_SIZE);
  const [error, setError] = useState<string | null>(null);

  const filters = useCallback(
    () => ({
      siteId: siteId || undefined,
      severity: (severity || undefined) as Severity | undefined,
      limit: PAGE_SIZE,
    }),
    [siteId, severity],
  );

  const refresh = useCallback(async () => {
    try {
      const { events: fresh } = await api.listEvents(filters());
      setEvents(fresh);
      setExhausted(fresh.length < PAGE_SIZE);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [filters]);

  // Refetch on filter change, then keep the feed live.
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  async function loadMore() {
    const oldest = events[events.length - 1];
    if (!oldest) return;
    setLoadingMore(true);
    try {
      const { events: older } = await api.listEvents({
        ...filters(),
        before: oldest.occurredAt,
      });
      setEvents((cur) => [...cur, ...older]);
      setExhausted(older.length < PAGE_SIZE);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      {!compact && (
      <div>
        <Eyebrow gold>Pillar 02 / Behavior Intelligence</Eyebrow>
        <h1
          style={{
            fontFamily: "var(--font-serif), 'Instrument Serif', serif",
            fontSize: "clamp(32px, 4vw, 48px)",
            letterSpacing: "-0.02em",
            fontWeight: 400,
            margin: "12px 0 0",
            lineHeight: 1.05,
          }}
        >
          Events
        </h1>
        <p style={{ color: "var(--ink-2)", marginTop: 12, maxWidth: 620 }}>
          Rules firing on live camera feeds — presence, dwell, and re-entry,
          evaluated continuously by the detection worker. The feed
          refreshes every {POLL_MS / 1000} seconds.
        </p>
      </div>
      )}

      <div style={{ display: "flex", gap: 16, maxWidth: 520 }}>
        {!fixedSiteId && (
          <Select
            label="Site"
            value={siteId}
            onChange={setSiteId}
            options={[
              { value: "", label: "All sites" },
              ...sites.map((s) => ({ value: s.id, label: s.label })),
            ]}
          />
        )}
        <Select
          label="Severity"
          value={severity}
          onChange={setSeverity}
          options={[
            { value: "", label: "Any" },
            { value: "high", label: "High" },
            { value: "medium", label: "Medium" },
            { value: "low", label: "Low" },
          ]}
        />
      </div>

      {error && (
        <p style={{ color: "var(--red)", fontFamily: "var(--font-mono), 'JetBrains Mono', monospace", fontSize: 12, margin: 0 }}>
          {error}
        </p>
      )}

      {events.length === 0 ? (
        <div style={{ padding: "48px 24px", border: "1px dashed var(--rule-2)", textAlign: "center" }}>
          <Eyebrow>No events yet</Eyebrow>
          <p style={{ color: "var(--ink-2)", marginTop: 12, maxWidth: 520, marginLeft: "auto", marginRight: "auto" }}>
            Events appear here when a connector&apos;s behavior engine fires a
            rule. Arm one under a site&apos;s Rules tab — the connector picks
            up changes within a minute.
          </p>
        </div>
      ) : (
        <Table
          columns={["When", "Rule", "Camera / Zone", "Trigger", "Severity", "Detail", ""]}
          templateColumns={COLUMNS}
        >
          {events.map((ev, i) => (
            <TableRow key={ev.id} templateColumns={COLUMNS} divider={i > 0}>
              <Mono>{formatWhen(ev.occurredAt)}</Mono>
              <span style={{ fontFamily: "var(--font-serif), 'Instrument Serif', serif", fontSize: 17 }}>
                {ev.ruleLabel}
              </span>
              <Mono>
                {ev.cameraLabel} / {ev.zoneLabel}
              </Mono>
              <Mono>{ev.triggerType.replaceAll("_", " ")}</Mono>
              <Mono
                style={{
                  color:
                    ev.severity === "high"
                      ? "var(--red)"
                      : ev.severity === "medium"
                      ? "var(--gold)"
                      : "var(--ink-2)",
                }}
              >
                {ev.severity}
              </Mono>
              <Mono>{formatDetail(ev)}</Mono>
              {ev.segmentKey ? (
                <button
                  onClick={() => setOpenEvent(ev)}
                  style={{
                    border: "none",
                    background: "none",
                    cursor: "pointer",
                    padding: 0,
                    fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
                    fontSize: 11,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "var(--gold)",
                  }}
                >
                  clip ▸
                </button>
              ) : ev.snapshotKey ? (
                <a
                  href={SNAPSHOT_URL(ev.snapshotKey)}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
                    fontSize: 11,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "var(--gold)",
                  }}
                >
                  frame ↗
                </a>
              ) : (
                <span />
              )}
            </TableRow>
          ))}
        </Table>
      )}

      {!exhausted && events.length > 0 && (
        <div>
          <Button onClick={() => void loadMore()} disabled={loadingMore}>
            {loadingMore ? "Loading…" : "Load older events"}
          </Button>
        </div>
      )}

      {openEvent && <EventClipModal event={openEvent} onClose={() => setOpenEvent(null)} />}
    </section>
  );
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const sameDay = new Date().toDateString() === d.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : d.toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

function formatDetail(ev: EventRecord): string {
  const m = ev.metadata as Record<string, unknown>;
  if (typeof m.dwellSeconds === "number") return `${Math.round(m.dwellSeconds)}s dwell`;
  if (typeof m.absentSeconds === "number") return `back after ${Math.round(m.absentSeconds)}s`;
  if (typeof m.confidence === "number") return `${Math.round(m.confidence * 100)}% conf`;
  return "—";
}

function Mono({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <span
      style={{
        fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
        fontSize: 11,
        letterSpacing: "0.08em",
        color: "var(--ink-2)",
        textTransform: "uppercase",
        ...style,
      }}
    >
      {children}
    </span>
  );
}
