import type { ReactNode } from "react";
import { Eyebrow } from "./Eyebrow.js";

export function SectionHead({
  eyebrow,
  num,
  title,
  intro,
}: {
  eyebrow?: ReactNode;
  num?: ReactNode;
  title: ReactNode;
  intro?: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-end",
        flexWrap: "wrap",
        gap: 20,
        marginBottom: 32,
      }}
    >
      <div style={{ maxWidth: 820 }}>
        {eyebrow && <Eyebrow gold>{eyebrow}</Eyebrow>}
        <h2
          style={{
            fontFamily: "var(--font-serif), 'Instrument Serif', serif",
            fontWeight: 400,
            fontSize: "clamp(28px, 3.6vw, 44px)",
            lineHeight: 1.05,
            letterSpacing: "-0.01em",
            margin: eyebrow ? "12px 0 0" : 0,
          }}
        >
          {title}
        </h2>
        {intro && (
          <p
            style={{
              color: "var(--ink-2)",
              fontSize: 15,
              maxWidth: 560,
              marginTop: 12,
            }}
          >
            {intro}
          </p>
        )}
      </div>
      {num && <Eyebrow>{num}</Eyebrow>}
    </div>
  );
}
