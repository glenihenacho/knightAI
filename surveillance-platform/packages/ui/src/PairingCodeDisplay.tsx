export function PairingCodeDisplay({ code }: { code: string }) {
  return (
    <div
      style={{
        fontFamily: "ui-monospace, SFMono-Regular, monospace",
        fontSize: 32,
        letterSpacing: 4,
        padding: "16px 24px",
        border: "1px dashed #94a3b8",
        borderRadius: 8,
        textAlign: "center",
        userSelect: "all",
      }}
    >
      {code}
    </div>
  );
}
