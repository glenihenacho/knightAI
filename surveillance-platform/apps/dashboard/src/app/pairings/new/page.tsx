"use client";

import { useState } from "react";
import { PairingCodeDisplay } from "@surveillance/ui";
import { api } from "@/lib/api";

export default function NewPairingPage() {
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function create() {
    setPending(true);
    setError(null);
    try {
      const res = await api.createPairing("00000000-0000-0000-0000-000000000001");
      setCode(res.code);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <section>
      <h1>Pair a connector</h1>
      <p>Generate a one-time code, then enter it in the Tauri connector running on the customer network.</p>
      <button onClick={create} disabled={pending}>
        {pending ? "Generating..." : "Generate pairing code"}
      </button>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      {code && (
        <div style={{ marginTop: 24 }}>
          <PairingCodeDisplay code={code} />
        </div>
      )}
    </section>
  );
}
