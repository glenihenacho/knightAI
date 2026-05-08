"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Eyebrow } from "@surveillance/ui";
import { api } from "@/lib/api";

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "12px 14px",
  marginTop: 6,
  border: "1px solid var(--rule-2)",
  background: "rgba(255,255,255,0.02)",
  color: "var(--ink)",
  fontSize: 15,
};

const labelStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
  fontSize: 11,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "var(--ink-2)",
};

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
      <Shell>
        <Eyebrow gold>Check your email</Eyebrow>
        <h1 style={titleStyle}>
          Sign-in link <span style={{ color: "var(--gold)", fontStyle: "italic" }}>sent.</span>
        </h1>
        <p style={paraStyle}>
          We sent a one-time link to <strong style={{ color: "var(--ink)" }}>{email}</strong>. It
          expires in 15 minutes.
        </p>
        <button type="button" onClick={() => setSent(false)} style={linkButtonStyle}>
          Use a different email →
        </button>
      </Shell>
    );
  }

  return (
    <Shell>
      <Eyebrow gold>Sign in</Eyebrow>
      <h1 style={titleStyle}>
        One-time link, <span style={{ color: "var(--gold)", fontStyle: "italic" }}>no password.</span>
      </h1>
      <p style={paraStyle}>Enter your email. We&rsquo;ll send a magic link valid for 15 minutes.</p>
      {errorParam && <ErrorBanner code={errorParam} />}
      <form onSubmit={submit} style={{ display: "grid", gap: 16, marginTop: 24 }}>
        <label style={labelStyle}>
          Email
          <input
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
          />
        </label>
        <button
          type="submit"
          disabled={pending || email.length === 0}
          style={{
            padding: "13px 22px",
            background: "white",
            color: "#1a1305",
            border: "1px solid rgba(233,184,100,.4)",
            fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
            fontSize: 12,
            fontWeight: 500,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            cursor: pending ? "default" : "pointer",
            opacity: pending || email.length === 0 ? 0.6 : 1,
          }}
        >
          {pending ? "Sending…" : "Send sign-in link →"}
        </button>
        {error && (
          <p style={{ color: "var(--red)", fontFamily: "var(--font-mono), 'JetBrains Mono', monospace", fontSize: 12 }}>
            {error}
          </p>
        )}
      </form>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
      }}
    >
      <section
        style={{
          width: "100%",
          maxWidth: 460,
          padding: "40px 32px",
          border: "1px solid var(--rule-2)",
          background: "linear-gradient(180deg, #13130f 0%, #0c0c0a 100%)",
          boxShadow: "0 30px 80px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)",
        }}
      >
        {children}
      </section>
    </div>
  );
}

const titleStyle: React.CSSProperties = {
  fontFamily: "var(--font-serif), 'Instrument Serif', serif",
  fontSize: 40,
  letterSpacing: "-0.02em",
  fontWeight: 400,
  margin: "12px 0 0",
  lineHeight: 1.05,
};

const paraStyle: React.CSSProperties = {
  color: "var(--ink-2)",
  marginTop: 16,
  fontSize: 15,
};

const linkButtonStyle: React.CSSProperties = {
  marginTop: 24,
  background: "transparent",
  border: "none",
  color: "var(--gold)",
  fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
  fontSize: 11,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  cursor: "pointer",
  padding: 0,
};

function ErrorBanner({ code }: { code: string }) {
  const messages: Record<string, string> = {
    "missing-token": "The sign-in link was malformed. Please request a new one.",
    "invalid-or-expired": "That sign-in link has expired or already been used.",
    "no-account": "No account is set up for that email yet — ask your admin to invite you.",
    "provisioning-failed":
      "Couldn't sign you in. The platform may not be set up yet — contact your administrator.",
  };
  return (
    <p
      role="alert"
      style={{
        padding: "12px 14px",
        background: "rgba(255, 90, 77, 0.08)",
        border: "1px solid rgba(255, 90, 77, 0.3)",
        color: "var(--red)",
        marginTop: 24,
        fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
        fontSize: 12,
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
