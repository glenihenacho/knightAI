"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Schedule, ScheduleWindow } from "@surveillance/shared";
import { Button, Eyebrow, Input, Modal, Table, TableRow } from "@surveillance/ui";
import { api } from "@/lib/api";
import { ScheduleEditor, summarizeWindows } from "../../../_components/schedule-editor";

const COLUMNS = "1fr 2fr auto auto";

export function SchedulesManager({ siteId, schedules }: { siteId: string; schedules: Schedule[] }) {
  const router = useRouter();
  // null = closed; "new" = creating; otherwise the schedule being edited.
  const [editing, setEditing] = useState<"new" | Schedule | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove(id: string) {
    setPending(true);
    setError(null);
    try {
      await api.deleteSchedule(id);
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
        <Button variant="primary" onClick={() => setEditing("new")}>
          + Add schedule
        </Button>
      </div>

      {error && (
        <p style={{ color: "var(--red)", fontFamily: "var(--font-mono), 'JetBrains Mono', monospace", fontSize: 12, margin: 0 }}>
          {error}
        </p>
      )}

      {schedules.length === 0 ? (
        <div style={{ padding: "48px 24px", border: "1px dashed var(--rule-2)", textAlign: "center" }}>
          <Eyebrow>No schedules yet</Eyebrow>
          <p style={{ color: "var(--ink-2)", marginTop: 12 }}>
            Schedules are reusable time windows — rules reference them to only fire when it matters
            (&ldquo;normal at noon, suspicious at 2 AM&rdquo;).
          </p>
        </div>
      ) : (
        <Table columns={["Schedule", "Windows", "", ""]} templateColumns={COLUMNS}>
          {schedules.map((s, i) => (
            <TableRow key={s.id} templateColumns={COLUMNS} divider={i > 0}>
              <span style={{ fontFamily: "var(--font-serif), 'Instrument Serif', serif", fontSize: 20 }}>
                {s.label}
              </span>
              <span
                style={{
                  fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
                  fontSize: 11,
                  letterSpacing: "0.08em",
                  color: "var(--ink-2)",
                }}
              >
                {summarizeWindows(s.windows)}
              </span>
              <Button onClick={() => setEditing(s)} disabled={pending}>
                Edit
              </Button>
              <Button onClick={() => void remove(s.id)} disabled={pending}>
                Delete
              </Button>
            </TableRow>
          ))}
        </Table>
      )}

      {editing !== null && (
        <ScheduleDialog
          siteId={siteId}
          schedule={editing === "new" ? null : editing}
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

function ScheduleDialog({
  siteId,
  schedule,
  onClose,
  onSaved,
}: {
  siteId: string;
  schedule: Schedule | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [label, setLabel] = useState(schedule?.label ?? "");
  const [windows, setWindows] = useState<ScheduleWindow[]>(schedule?.windows ?? []);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      if (schedule) {
        await api.updateSchedule(schedule.id, { label, windows });
      } else {
        await api.createSchedule(siteId, { label, windows });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal open title={schedule ? "Edit schedule" : "Add schedule"} onClose={onClose} width={720}>
      <form onSubmit={submit} style={{ display: "grid", gap: 20 }}>
        <Input label="Label" value={label} onChange={setLabel} placeholder="e.g. Business hours" required autoFocus />
        <ScheduleEditor windows={windows} onChange={setWindows} />
        <div style={{ display: "flex", gap: 12 }}>
          <Button type="submit" variant="primary" disabled={pending || label.length === 0 || windows.length === 0}>
            {pending ? "Saving…" : schedule ? "Save changes →" : "Create schedule →"}
          </Button>
          <Button onClick={onClose}>Cancel</Button>
        </div>
        {error && (
          <p style={{ color: "var(--red)", fontFamily: "var(--font-mono), 'JetBrains Mono', monospace", fontSize: 12, margin: 0 }}>
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
