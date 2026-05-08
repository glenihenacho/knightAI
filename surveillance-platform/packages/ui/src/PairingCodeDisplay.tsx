export function PairingCodeDisplay({ code }: { code: string }) {
  return (
    <div
      style={{
        fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
        fontSize: 36,
        fontWeight: 500,
        letterSpacing: "0.32em",
        padding: "20px 28px",
        border: "1px solid var(--rule-2)",
        background: "linear-gradient(180deg, rgba(233,184,100,.06), transparent 70%)",
        color: "var(--gold)",
        textAlign: "center",
        userSelect: "all",
      }}
    >
      {code}
    </div>
  );
}
