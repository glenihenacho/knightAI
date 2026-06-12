"use client";

import { useState } from "react";
import type { Rule, Schedule, Severity, Trigger, Zone } from "@surveillance/shared";
import { Button, Input, Modal, Select } from "@surveillance/ui";
import { api } from "@/lib/api";

type TriggerType = Trigger["type"];

// Mirror the zod bounds in @surveillance/shared rule.ts.
const DWELL_RANGE = { min: 5, max: 3600 };
const REENTRY_RANGE = { min: 10, max: 86400 };

interface CameraZones {
  cameraId: string;
  cameraLabel: string;
  zones: Zone[];
}

interface RuleFormProps {
  siteId: string;
  /** null = create a new rule. */
  rule: Rule | null;
  schedules: Schedule[];
  cameras: CameraZones[];
  onClose: () => void;
  onSaved: () => void;
}

export function RuleForm({ siteId, rule, schedules, cameras, onClose, onSaved }: RuleFormProps) {
  const camerasWithZones = cameras.filter((c) => c.zones.length > 0);
  const initialCameraId =
    (rule && camerasWithZones.find((c) => c.zones.some((z) => z.id === rule.zoneId))?.cameraId) ??
    camerasWithZones[0]?.cameraId ??
    "";

  const [label, setLabel] = useState(rule?.label ?? "");
  const [cameraId, setCameraId] = useState(initialCameraId);
  const zonesForCamera = camerasWithZones.find((c) => c.cameraId === cameraId)?.zones ?? [];
  const [zoneId, setZoneId] = useState(rule?.zoneId ?? zonesForCamera[0]?.id ?? "");
  const [scheduleId, setScheduleId] = useState(rule?.scheduleId ?? "");
  const [severity, setSeverity] = useState<Severity>(rule?.action.severity ?? "medium");
  const [triggerType, setTriggerType] = useState<TriggerType>(rule?.trigger.type ?? "presence_in_zone");
  const [dwellSeconds, setDwellSeconds] = useState(
    rule?.trigger.type === "dwell" ? String(rule.trigger.params.minDurationSeconds) : "60",
  );
  const [reentrySeconds, setReentrySeconds] = useState(
    rule?.trigger.type === "reentry" ? String(rule.trigger.params.withinSeconds) : "300",
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function buildTrigger(): Trigger {
    switch (triggerType) {
      case "dwell":
        return { type: "dwell", params: { minDurationSeconds: Number(dwellSeconds) } };
      case "reentry":
        return { type: "reentry", params: { withinSeconds: Number(reentrySeconds) } };
      default:
        return { type: "presence_in_zone", params: {} };
    }
  }

  function inRange(raw: string, range: { min: number; max: number }): boolean {
    const n = Number(raw);
    return Number.isInteger(n) && n >= range.min && n <= range.max;
  }

  const triggerValid =
    triggerType === "presence_in_zone" ||
    (triggerType === "dwell" && inRange(dwellSeconds, DWELL_RANGE)) ||
    (triggerType === "reentry" && inRange(reentrySeconds, REENTRY_RANGE));

  function selectCamera(id: string) {
    setCameraId(id);
    const zones = camerasWithZones.find((c) => c.cameraId === id)?.zones ?? [];
    setZoneId(zones[0]?.id ?? "");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const payload = {
      label,
      zoneId,
      scheduleId: scheduleId === "" ? null : scheduleId,
      trigger: buildTrigger(),
      action: { type: "raise_event" as const, severity },
    };
    try {
      if (rule) {
        await api.updateRule(rule.id, payload);
      } else {
        await api.createRule(siteId, payload);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal open title={rule ? "Edit rule" : "Add rule"} onClose={onClose} width={520}>
      <form onSubmit={submit} style={{ display: "grid", gap: 16 }}>
        <Input
          label="Label"
          value={label}
          onChange={setLabel}
          placeholder="e.g. Lobby after hours"
          required
          autoFocus
        />
        <Select
          label="Camera"
          value={cameraId}
          onChange={selectCamera}
          options={camerasWithZones.map((c) => ({ value: c.cameraId, label: c.cameraLabel }))}
        />
        <Select
          label="Zone"
          value={zoneId}
          onChange={setZoneId}
          options={zonesForCamera.map((z) => ({ value: z.id, label: z.label }))}
        />
        <Select
          label="Schedule"
          value={scheduleId}
          onChange={setScheduleId}
          options={[
            { value: "", label: "Always" },
            ...schedules.map((s) => ({ value: s.id, label: s.label })),
          ]}
        />
        {/* path_deviation stays deferred until reference paths can be
            authored; the engine has nothing to compare a track against. */}
        <Select
          label="Trigger"
          value={triggerType}
          onChange={(v) => setTriggerType(v as TriggerType)}
          options={[
            { value: "presence_in_zone", label: "Presence in zone" },
            { value: "dwell", label: "Dwell (loitering)" },
            { value: "reentry", label: "Re-entry" },
          ]}
        />
        {triggerType === "dwell" && (
          <Input
            label={`Minimum dwell — seconds (${DWELL_RANGE.min}–${DWELL_RANGE.max})`}
            type="number"
            value={dwellSeconds}
            onChange={setDwellSeconds}
            required
          />
        )}
        {triggerType === "reentry" && (
          <Input
            label={`Re-entry window — seconds (${REENTRY_RANGE.min}–${REENTRY_RANGE.max})`}
            type="number"
            value={reentrySeconds}
            onChange={setReentrySeconds}
            required
          />
        )}
        <Select
          label="Severity"
          value={severity}
          onChange={(v) => setSeverity(v as Severity)}
          options={[
            { value: "low", label: "Low" },
            { value: "medium", label: "Medium" },
            { value: "high", label: "High" },
          ]}
        />
        <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
          <Button
            type="submit"
            variant="primary"
            disabled={pending || label.length === 0 || zoneId === "" || !triggerValid}
          >
            {pending ? "Saving…" : rule ? "Save changes →" : "Create rule →"}
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
