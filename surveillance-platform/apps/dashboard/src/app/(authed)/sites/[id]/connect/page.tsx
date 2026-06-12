"use client";

import Link from "next/link";
import { useState } from "react";
import { Eyebrow, PairingCodeDisplay } from "@surveillance/ui";
import { api } from "@/lib/api";

export default function PairConnectorPage({ params }: { params: { id: string } }) {
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function generate() {
    setPending(true);
    setError(null);
    try {
      const res = await api.createPairing(params.id);
      setCode(res.code);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <Eyebrow gold>Pair a connector</Eyebrow>
        <h2
          style={{
            fontFamily: "var(--font-serif), 'Instrument Serif', serif",
            fontSize: 36,
            letterSpacing: "-0.01em",
            fontWeight: 400,
            margin: "12px 0 0",
          }}
        >
          One-time code, ten-minute window.
        </h2>
        <p style={{ color: "var(--ink-2)", maxWidth: 520, marginTop: 12 }}>
          Generate a code below, then enter it in the GoldCrusade connector running on the customer
          network. The connector trades the code for a long-lived token over the same channel.
        </p>
      </div>

      <button
        type="button"
        onClick={generate}
        disabled={pending}
        style={{
          alignSelf: "flex-start",
          padding: "13px 22px",
          background: "white",
          color: "#1a1305",
          border: "1px solid rgba(233, 184, 100, 0.4)",
          fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
          fontSize: 12,
          fontWeight: 500,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          cursor: pending ? "default" : "pointer",
        }}
      >
        {pending ? "Generating…" : "Generate pairing code →"}
      </button>

      {error && (
        <p style={{ color: "var(--red)", fontFamily: "var(--font-mono), 'JetBrains Mono', monospace", fontSize: 12 }}>
          {error}
        </p>
      )}

      {code && (
        <div style={{ marginTop: 8 }}>
          <PairingCodeDisplay code={code} />
          <p
            style={{
              marginTop: 16,
              color: "var(--ink-2)",
              fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
              fontSize: 11,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            Code expires in 10 minutes. Once redeemed, the connector appears under{" "}
            <Link href={`/sites/${params.id}/connectors`} style={{ color: "var(--gold)" }}>
              Connectors
            </Link>
            .
          </p>
        </div>
      )}
    </section>
  );
}
