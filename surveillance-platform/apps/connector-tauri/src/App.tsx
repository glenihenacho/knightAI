import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface PairedState {
  status: "paired";
  connectorId: string;
  apiBaseUrl: string;
  siteName: string;
}

interface UnpairedState {
  status: "unpaired";
}

type AppState = PairedState | UnpairedState | { status: "loading" };

export function App() {
  const [state, setState] = useState<AppState>({ status: "loading" });
  const [code, setCode] = useState("");
  const [apiUrl, setApiUrl] = useState(
    import.meta.env.DEV ? "http://localhost:4000" : "https://api.goldcrusade.com"
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke<PairedState | UnpairedState>("get_pairing_status")
      .then(setState)
      .catch(() => setState({ status: "unpaired" }));
  }, []);

  async function pair() {
    setError(null);
    try {
      const next = await invoke<PairedState>("pair_with_code", { apiUrl, code });
      setState(next);
    } catch (e) {
      setError(String(e));
    }
  }

  async function reset() {
    setError(null);
    try {
      const next = await invoke<UnpairedState>("reset_pairing");
      setCode("");
      setState(next);
    } catch (e) {
      setError(String(e));
    }
  }

  if (state.status === "loading") return <p>Loading…</p>;

  if (state.status === "unpaired") {
    return (
      <section style={{ padding: 24, maxWidth: 480 }}>
        <h1>Pair connector</h1>
        <p>Enter the pairing code shown in the dashboard.</p>
        <label style={{ display: "block", marginBottom: 8 }}>
          API URL
          <input
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
            style={{ width: "100%", padding: 8 }}
          />
        </label>
        <label style={{ display: "block", marginBottom: 8 }}>
          Pairing code
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="XXXX-XXXX"
            style={{ width: "100%", padding: 8, fontFamily: "monospace", fontSize: 18 }}
          />
        </label>
        <button onClick={pair}>Pair</button>
        {error && <p style={{ color: "crimson" }}>{error}</p>}
      </section>
    );
  }

  return (
    <section style={{ padding: 24, maxWidth: 480 }}>
      <h1>Connector running</h1>
      <p>
        Paired to <strong>{state.siteName || "—"}</strong>.
      </p>
      <p>
        Connector <code>{state.connectorId}</code> is polling{" "}
        <code>{state.apiBaseUrl}</code> for commands.
      </p>
      <hr style={{ margin: "20px 0", border: "none", borderTop: "1px solid #ddd" }} />
      <p style={{ fontSize: 13, color: "#555" }}>
        Re-pair to move this machine to a different site. This stops the current
        site's streams and clears the pairing.
      </p>
      <button onClick={reset}>Re-pair this connector</button>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
    </section>
  );
}
