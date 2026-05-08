import type { ReactNode } from "react";

export function Stat({
  value,
  label,
}: {
  value: ReactNode;
  label: ReactNode;
}) {
  return (
    <div>
      <div
        style={{
          fontFamily: "var(--font-serif), 'Instrument Serif', serif",
          fontSize: 56,
          lineHeight: 1,
          color: "var(--gold)",
          letterSpacing: "-0.01em",
        }}
      >
        {value}
      </div>
      <div
        style={{
          marginTop: 12,
          fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
          fontSize: 10,
          letterSpacing: "0.16em",
          color: "var(--ink-2)",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
    </div>
  );
}
