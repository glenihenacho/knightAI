"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";

function LoginForm() {
  const params = useSearchParams();
  const errorParam = params.get("error");
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await api.requestMagicLink(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  if (sent) {
    return (
      <section style={{ maxWidth: 420 }}>
        <h1>Check your email</h1>
        <p>
          We sent a sign-in link to <strong>{email}</strong>. The link expires
          in 15 minutes.
        </p>
        <p style={{ color: "var(--color-muted)", fontSize: 14 }}>
          Didn&rsquo;t get it? Wait a minute, then{" "}
          <button
            type="button"
            onClick={() => setSent(false)}
            style={{ background: "none", border: "none", color: "inherit", textDecoration: "underline", cursor: "pointer", padding: 0 }}
          >
            try again
          </button>
          .
        </p>
      </section>
    );
  }

  return (
    <section style={{ maxWidth: 420 }}>
      <h1>Sign in</h1>
      <p>Enter your email address. We&rsquo;ll send you a one-time sign-in link.</p>
      {errorParam && <ErrorBanner code={errorParam} />}
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <label>
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
            style={{
              display: "block",
              width: "100%",
              padding: 8,
              marginTop: 4,
              border: "1px solid var(--color-border)",
              borderRadius: 4,
            }}
          />
        </label>
        <button type="submit" disabled={pending || email.length === 0}>
          {pending ? "Sending..." : "Send sign-in link"}
        </button>
        {error && <p style={{ color: "crimson" }}>{error}</p>}
      </form>
    </section>
  );
}

function ErrorBanner({ code }: { code: string }) {
  const messages: Record<string, string> = {
    "missing-token": "The sign-in link was malformed. Please request a new one.",
    "invalid-or-expired": "That sign-in link has expired or already been used.",
    "provisioning-failed":
      "Couldn't sign you in. The platform may not be set up yet — contact your administrator.",
  };
  return (
    <p
      role="alert"
      style={{
        padding: "8px 12px",
        background: "#fee",
        border: "1px solid #fbb",
        borderRadius: 4,
        color: "#900",
        marginBottom: 12,
      }}
    >
      {messages[code] ?? "Sign-in failed. Please try again."}
    </p>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
