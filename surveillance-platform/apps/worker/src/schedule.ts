// "Is this rule active right now?" — schedule windows are evaluated in the
// site's timezone, matching the dashboard's 7x24 editor semantics. Uses
// Intl (ICU) for the timezone conversion, which handles DST without a
// dependency.

import type { ScheduleWindow } from "@surveillance/shared";

const DAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const formatters = new Map<string, Intl.DateTimeFormat>();

/**
 * Formatter for an IANA timezone, falling back to UTC on garbage — a bad
 * site timezone must degrade to "schedules run in UTC", not kill the worker.
 */
function formatterFor(timezone: string): Intl.DateTimeFormat {
  let fmt = formatters.get(timezone);
  if (fmt) return fmt;
  try {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
  } catch {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
  }
  formatters.set(timezone, fmt);
  return fmt;
}

/** Local (dayOfWeek 0=Sunday, minute-of-day) of an instant in a timezone. */
export function localDayMinute(atMs: number, timezone: string): { day: number; minute: number } {
  const parts = formatterFor(timezone).formatToParts(new Date(atMs));
  let day = 0;
  let hour = 0;
  let minute = 0;
  for (const part of parts) {
    if (part.type === "weekday") day = DAY_INDEX[part.value] ?? 0;
    else if (part.type === "hour") hour = Number(part.value);
    else if (part.type === "minute") minute = Number(part.value);
  }
  // hourCycle h23 still yields "24" for midnight in some ICU versions.
  if (hour === 24) hour = 0;
  return { day, minute: hour * 60 + minute };
}

export function isActive(
  windows: readonly ScheduleWindow[],
  atMs: number,
  timezone: string,
): boolean {
  const { day, minute } = localDayMinute(atMs, timezone);
  return windows.some(
    (w) => w.dayOfWeek === day && w.startMinute <= minute && minute < w.endMinute,
  );
}
