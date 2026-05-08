import { Eyebrow } from "@surveillance/ui";

export function ComingSoon({
  pillar,
  label,
  title,
  body,
  bullets,
}: {
  pillar: string;
  label: string;
  title: string;
  body: string;
  bullets: [string, string][];
}) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      <div>
        <Eyebrow gold>
          Pillar {pillar} / {label}
        </Eyebrow>
        <h1
          style={{
            fontFamily: "var(--font-serif), 'Instrument Serif', serif",
            fontSize: "clamp(40px, 5vw, 64px)",
            letterSpacing: "-0.02em",
            fontWeight: 400,
            margin: "12px 0 0",
            lineHeight: 1.05,
          }}
        >
          {title}
        </h1>
        <p style={{ color: "var(--ink-2)", maxWidth: 640, marginTop: 16, fontSize: 16 }}>{body}</p>
      </div>

      <div
        style={{
          padding: "48px 32px",
          border: "1px solid var(--rule-2)",
          background: "linear-gradient(180deg, rgba(233,184,100,.04), transparent 70%)",
          textAlign: "center",
        }}
      >
        <Eyebrow>Coming soon</Eyebrow>
        <p
          style={{
            color: "var(--ink-2)",
            marginTop: 12,
            fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
            fontSize: 12,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          This pillar is scaffolded but inactive in Phase 0.
        </p>
      </div>

      <div style={{ borderTop: "1px solid var(--rule)" }}>
        {bullets.map(([heading, desc], i) => (
          <div
            key={heading}
            style={{
              padding: "20px 0",
              borderBottom: i === bullets.length - 1 ? "none" : "1px solid var(--rule)",
              display: "grid",
              gridTemplateColumns: "24px 1fr",
              gap: 16,
            }}
          >
            <span
              style={{
                color: "var(--gold)",
                fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
                fontSize: 14,
              }}
            >
              +
            </span>
            <div>
              <strong style={{ color: "var(--ink)", fontWeight: 500 }}>{heading}</strong>
              <span style={{ display: "block", color: "var(--ink-2)", marginTop: 4, fontSize: 14 }}>
                {desc}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
