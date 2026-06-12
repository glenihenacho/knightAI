"use client";

import { useEffect, useState } from "react";
import type { ScheduleWindow } from "@surveillance/shared";
import { Button, Eyebrow } from "@surveillance/ui";

// 7×24 hour grid (rows = days Mon..Sun, cols = hours). Click toggles a cell;
// click-and-drag paints. Hour granularity is deliberate for Phase 1 — windows
// serialize as contiguous hour runs per day.

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
// Row index (Mon-first display) -> dayOfWeek (0 = Sunday).
const ROW_TO_DOW = [1, 2, 3, 4, 5, 6, 0];

type Grid = boolean[][]; // [7 rows][24 hours]

function emptyGrid(): Grid {
  return Array.from({ length: 7 }, () => Array<boolean>(24).fill(false));
}

export function windowsToGrid(windows: ScheduleWindow[]): Grid {
  const grid = emptyGrid();
  for (const w of windows) {
    const row = ROW_TO_DOW.indexOf(w.dayOfWeek);
    if (row === -1) continue;
    const startHour = Math.floor(w.startMinute / 60);
    const endHour = Math.ceil(w.endMinute / 60);
    for (let h = startHour; h < endHour && h < 24; h++) grid[row]![h] = true;
  }
  return grid;
}

export function gridToWindows(grid: Grid): ScheduleWindow[] {
  const windows: ScheduleWindow[] = [];
  grid.forEach((hours, row) => {
    const dayOfWeek = ROW_TO_DOW[row]!;
    let runStart: number | null = null;
    for (let h = 0; h <= 24; h++) {
      const on = h < 24 && hours[h];
      if (on && runStart === null) runStart = h;
      if (!on && runStart !== null) {
        windows.push({ dayOfWeek, startMinute: runStart * 60, endMinute: h * 60 });
        runStart = null;
      }
    }
  });
  return windows;
}

const PRESETS: { label: string; windows: ScheduleWindow[] }[] = [
  {
    label: "Business hours",
    windows: [1, 2, 3, 4, 5].map((dayOfWeek) => ({
      dayOfWeek,
      startMinute: 9 * 60,
      endMinute: 17 * 60,
    })),
  },
  {
    label: "Overnight",
    windows: [0, 1, 2, 3, 4, 5, 6].flatMap((dayOfWeek) => [
      { dayOfWeek, startMinute: 22 * 60, endMinute: 24 * 60 },
      { dayOfWeek, startMinute: 0, endMinute: 6 * 60 },
    ]),
  },
  {
    label: "Weekends",
    windows: [6, 0].map((dayOfWeek) => ({ dayOfWeek, startMinute: 0, endMinute: 24 * 60 })),
  },
];

interface ScheduleEditorProps {
  windows: ScheduleWindow[];
  onChange: (windows: ScheduleWindow[]) => void;
}

export function ScheduleEditor({ windows, onChange }: ScheduleEditorProps) {
  const [grid, setGrid] = useState<Grid>(() => windowsToGrid(windows));
  // Paint value while the mouse is held down; null = not painting.
  const [painting, setPainting] = useState<boolean | null>(null);

  useEffect(() => {
    const stop = () => setPainting(null);
    window.addEventListener("mouseup", stop);
    return () => window.removeEventListener("mouseup", stop);
  }, []);

  function apply(next: Grid) {
    setGrid(next);
    onChange(gridToWindows(next));
  }

  function setCell(row: number, hour: number, value: boolean) {
    const next = grid.map((r) => [...r]);
    next[row]![hour] = value;
    apply(next);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <Eyebrow>Presets</Eyebrow>
        {PRESETS.map((p) => (
          <Button key={p.label} onClick={() => apply(windowsToGrid(p.windows))} style={{ padding: "8px 12px", fontSize: 10 }}>
            {p.label}
          </Button>
        ))}
        <Button onClick={() => apply(emptyGrid())} style={{ padding: "8px 12px", fontSize: 10 }}>
          Clear
        </Button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "44px repeat(24, 1fr)",
          gap: 2,
          userSelect: "none",
        }}
      >
        <span />
        {Array.from({ length: 24 }, (_, h) => (
          <span
            key={h}
            style={{
              fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
              fontSize: 8,
              color: "var(--ink-2)",
              textAlign: "center",
            }}
          >
            {h % 6 === 0 ? `${h}` : ""}
          </span>
        ))}
        {grid.map((hours, row) => (
          <RowCells
            key={row}
            label={DAY_LABELS[row]!}
            hours={hours}
            onDown={(h) => {
              const value = !hours[h];
              setPainting(value);
              setCell(row, h, value);
            }}
            onEnter={(h) => {
              if (painting !== null) setCell(row, h, painting);
            }}
          />
        ))}
      </div>

      <p
        style={{
          margin: 0,
          fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
          fontSize: 10,
          letterSpacing: "0.1em",
          color: "var(--ink-2)",
          textTransform: "uppercase",
        }}
      >
        Click or drag to paint hours · evaluated in the site&apos;s timezone
      </p>
    </div>
  );
}

function RowCells({
  label,
  hours,
  onDown,
  onEnter,
}: {
  label: string;
  hours: boolean[];
  onDown: (hour: number) => void;
  onEnter: (hour: number) => void;
}) {
  return (
    <>
      <span
        style={{
          fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
          fontSize: 10,
          letterSpacing: "0.1em",
          color: "var(--ink-2)",
          textTransform: "uppercase",
          alignSelf: "center",
        }}
      >
        {label}
      </span>
      {hours.map((on, h) => (
        <div
          key={h}
          onMouseDown={(e) => {
            e.preventDefault();
            onDown(h);
          }}
          onMouseEnter={() => onEnter(h)}
          style={{
            height: 22,
            background: on ? "rgba(233, 184, 100, 0.55)" : "rgba(255,255,255,0.03)",
            border: on ? "1px solid var(--gold, #e9b864)" : "1px solid var(--rule)",
            cursor: "pointer",
            boxSizing: "border-box",
          }}
        />
      ))}
    </>
  );
}

const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function fmtMinute(m: number): string {
  const h = Math.floor(m / 60) % 24;
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** "Mon–Fri 09:00–17:00 · Sat 00:00–24:00" style summary for tables. */
export function summarizeWindows(windows: ScheduleWindow[]): string {
  if (windows.length === 0) return "—";
  // Group days that share the same exact set of time ranges.
  const byDay = new Map<number, string[]>();
  for (const w of windows) {
    const range = `${fmtMinute(w.startMinute)}–${w.endMinute === 1440 ? "24:00" : fmtMinute(w.endMinute)}`;
    byDay.set(w.dayOfWeek, [...(byDay.get(w.dayOfWeek) ?? []), range]);
  }
  const signatures = new Map<string, number[]>();
  for (const [day, ranges] of byDay) {
    const sig = ranges.sort().join(", ");
    signatures.set(sig, [...(signatures.get(sig) ?? []), day]);
  }
  const parts: string[] = [];
  for (const [sig, days] of signatures) {
    // Mon-first ordering for run detection.
    const ordered = days.map((d) => (d === 0 ? 7 : d)).sort((a, b) => a - b);
    const runs: string[] = [];
    let start = ordered[0]!;
    let prev = ordered[0]!;
    const flush = () => {
      const name = (d: number) => DOW_SHORT[d % 7]!;
      runs.push(start === prev ? name(start) : `${name(start)}–${name(prev)}`);
    };
    for (const d of ordered.slice(1)) {
      if (d === prev + 1) {
        prev = d;
      } else {
        flush();
        start = d;
        prev = d;
      }
    }
    flush();
    parts.push(`${runs.join(", ")} ${sig}`);
  }
  return parts.join(" · ");
}
