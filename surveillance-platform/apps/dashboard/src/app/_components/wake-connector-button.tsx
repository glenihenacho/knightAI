"use client";

import { useState } from "react";
import { api } from "@/lib/api";

type State = "idle" | "waking" | "sent" | "error";

// A connector with no live cameras goes dormant to let the database suspend.
// This is the manual "bring it back" affordance: it asks the API to wake the
// connector, which resumes normal polling within a wake-check interval.
export function WakeConnectorButton({ connectorId }: { connectorId: string }) {
  const [state, setState] = useState<State>("idle");

  async function wake() {
    setState("waking");
    try {
      await api.wakeConnector(connectorId);
      setState("sent");
      setTimeout(() => setState("idle"), 4000);
    } catch {
      setState("error");
      setTimeout(() => setState("idle"), 4000);
    }
  }

  const label =
    state === "waking" ? "Waking…" : state === "sent" ? "Wake sent" : state === "error" ? "Retry" : "Wake";

  return (
    <button
      type="button"
      onClick={wake}
      disabled={state === "waking" || state === "sent"}
      style={{
        fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
        fontSize: 11,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        padding: "6px 12px",
        background: "transparent",
        border: "1px solid var(--rule)",
        color: state === "error" ? "var(--danger, #b00)" : "var(--ink-2)",
        cursor: state === "waking" || state === "sent" ? "default" : "pointer",
      }}
    >
      {label}
    </button>
  );
}
