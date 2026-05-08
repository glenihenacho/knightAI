import type { CSSProperties, ReactNode } from "react";

export function Eyebrow({
  children,
  gold,
  style,
}: {
  children: ReactNode;
  gold?: boolean;
  style?: CSSProperties;
}) {
  return (
    <span
      style={{
        fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
        fontSize: 11,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: gold ? "var(--gold)" : "var(--ink-2)",
        ...style,
      }}
    >
      {children}
    </span>
  );
}
