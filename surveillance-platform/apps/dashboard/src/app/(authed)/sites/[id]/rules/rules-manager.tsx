"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Rule, Schedule, Zone } from "@surveillance/shared";
import { Button, Eyebrow, Table, TableRow } from "@surveillance/ui";
import { api } from "@/lib/api";
import { RuleForm } from "../../../_components/rule-form";

export interface CameraZones {
  cameraId: string;
  cameraLabel: string;
  zones: Zone[];
}

const COLUMNS = "1.2fr 1.2fr 1fr 1fr 0.7fr auto auto auto";

export function RulesManager({
  siteId,
  rules,
  schedules,
  cameras,
}: {
  siteId: string;
  rules: Rule[];
  schedules: Schedule[];
  cameras: CameraZones[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<"new" | Rule | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasZones = cameras.some((c) => c.zones.length > 0);

  function zoneName(zoneId: string): string {
    for (const cam of cameras) {
      const zone = cam.zones.find((z) => z.id === zoneId);
      if (zone) return `${cam.cameraLabel} / ${zone.label}`;
    }
    return "(deleted zone)";
  }

  function scheduleName(scheduleId: string | null): string {
    if (!scheduleId) return "Always";
    return schedules.find((s) => s.id === scheduleId)?.label ?? "(deleted schedule)";
  }

  async function toggleEnabled(rule: Rule) {
    setPending(true);
    setError(null);
    try {
      await api.updateRule(rule.id, { enabled: !rule.enabled });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  async function remove(id: string) {
    setPending(true);
    setError(null);
    try {
      await api.deleteRule(id);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <Button variant="primary" onClick={() => setEditing("new")} disabled={!hasZones}>
          + Add rule
        </Button>
        {!hasZones && (
          <p style={{ color: "var(--ink-2)", fontSize: 13, marginTop: 12 }}>
            Rules watch a zone — draw one on the Zones tab first.
          </p>
        )}
      </div>

      {error && (
        <p style={{ color: "var(--red)", fontFamily: "var(--font-mono), 'JetBrains Mono', monospace", fontSize: 12, margin: 0 }}>
          {error}
        </p>
      )}

      {rules.length === 0 ? (
        <div style={{ padding: "48px 24px", border: "1px dashed var(--rule-2)", textAlign: "center" }}>
          <Eyebrow>No rules yet</Eyebrow>
          <p style={{ color: "var(--ink-2)", marginTop: 12 }}>
            A rule binds a zone, a schedule, and a trigger to an action. Phase 1 rules raise events;
            Behavior Intelligence (Phase 2) starts evaluating them.
          </p>
        </div>
      ) : (
        <Table
          columns={["Rule", "Zone", "Schedule", "Trigger", "Severity", "Enabled", "", ""]}
          templateColumns={COLUMNS}
        >
          {rules.map((r, i) => (
            <TableRow key={r.id} templateColumns={COLUMNS} divider={i > 0}>
              <span style={{ fontFamily: "var(--font-serif), 'Instrument Serif', serif", fontSize: 19 }}>
                {r.label}
              </span>
              <Mono>{zoneName(r.zoneId)}</Mono>
              <Mono>{scheduleName(r.scheduleId)}</Mono>
              <Mono>{r.trigger.type.replaceAll("_", " ")}</Mono>
              <Mono
                style={{
                  color:
                    r.action.severity === "high"
                      ? "var(--red)"
                      : r.action.severity === "medium"
                      ? "var(--gold)"
                      : "var(--ink-2)",
                }}
              >
                {r.action.severity}
              </Mono>
              <button
                type="button"
                onClick={() => void toggleEnabled(r)}
                disabled={pending}
                aria-label={r.enabled ? "Disable rule" : "Enable rule"}
                style={{
                  justifySelf: "start",
                  width: 40,
                  height: 22,
                  border: "1px solid var(--rule-2)",
                  background: r.enabled ? "rgba(233,184,100,0.45)" : "rgba(255,255,255,0.04)",
                  cursor: "pointer",
                  position: "relative",
                  padding: 0,
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: 2,
                    left: r.enabled ? 20 : 2,
                    width: 16,
                    height: 16,
                    background: r.enabled ? "var(--gold, #e9b864)" : "var(--ink-2)",
                    transition: "left 0.15s ease",
                  }}
                />
              </button>
              <Button onClick={() => setEditing(r)} disabled={pending}>
                Edit
              </Button>
              <Button onClick={() => void remove(r.id)} disabled={pending}>
                Delete
              </Button>
            </TableRow>
          ))}
        </Table>
      )}

      {editing !== null && (
        <RuleForm
          siteId={siteId}
          rule={editing === "new" ? null : editing}
          schedules={schedules}
          cameras={cameras}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
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
