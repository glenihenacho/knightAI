"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Modal, Select } from "@surveillance/ui";
import { api } from "@/lib/api";

const FALLBACK_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Asia/Tokyo",
  "Australia/Sydney",
];

export function AddSiteButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const timezones = useMemo(() => {
    const supported =
      typeof Intl.supportedValuesOf === "function"
        ? Intl.supportedValuesOf("timeZone")
        : FALLBACK_TIMEZONES;
    return supported.includes("UTC") ? supported : ["UTC", ...supported];
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await api.createSite({ label, timezone });
      setOpen(false);
      setLabel("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        + Add site
      </Button>
      <Modal open={open} title="Add site" onClose={() => setOpen(false)}>
        <form onSubmit={submit} style={{ display: "grid", gap: 16 }}>
          <Input
            label="Label"
            value={label}
            onChange={setLabel}
            placeholder="e.g. Warehouse A"
            required
            autoFocus
          />
          <Select
            label="Timezone"
            value={timezone}
            onChange={setTimezone}
            options={timezones.map((tz) => ({ value: tz, label: tz }))}
          />
          <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
            <Button type="submit" variant="primary" disabled={pending || label.length === 0}>
              {pending ? "Creating…" : "Create site →"}
            </Button>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
          </div>
          {error && (
            <p style={{ color: "var(--red)", fontFamily: "var(--font-mono), 'JetBrains Mono', monospace", fontSize: 12, margin: 0 }}>
              {error}
            </p>
          )}
        </form>
      </Modal>
    </>
  );
}
