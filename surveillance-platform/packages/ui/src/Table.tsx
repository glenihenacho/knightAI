import type { CSSProperties, ReactNode } from "react";

// The bordered-grid table pattern used across the dashboard: a header row of
// mono uppercase column labels, then caller-supplied rows. Rows should use
// <TableRow> (or replicate its grid) with the same templateColumns.

interface TableProps {
  columns: string[];
  /** CSS grid-template-columns shared by header and rows. */
  templateColumns: string;
  children: ReactNode;
  style?: CSSProperties;
}

export function Table({ columns, templateColumns, children, style }: TableProps) {
  return (
    <div style={{ border: "1px solid var(--rule)", ...style }}>
      <div
        style={{
          padding: "14px 20px",
          borderBottom: "1px solid var(--rule)",
          display: "grid",
          gridTemplateColumns: templateColumns,
          gap: 16,
          alignItems: "center",
          fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
          fontSize: 10,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "var(--ink-2)",
        }}
      >
        {columns.map((c) => (
          <span key={c}>{c}</span>
        ))}
      </div>
      {children}
    </div>
  );
}

interface TableRowProps {
  templateColumns: string;
  children: ReactNode;
  /** Draw a separator above this row (use for every row after the first). */
  divider?: boolean;
  style?: CSSProperties;
}

export function TableRow({ templateColumns, children, divider, style }: TableRowProps) {
  return (
    <div
      style={{
        padding: "16px 20px",
        display: "grid",
        gridTemplateColumns: templateColumns,
        gap: 16,
        alignItems: "center",
        borderTop: divider ? "1px solid var(--rule)" : "none",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
