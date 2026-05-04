import type { ReactNode } from "react";
import "@surveillance/ui/styles.css";

export const metadata = {
  title: "Surveillance Platform",
  description: "Agentic surveillance for existing CCTV",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header
          style={{
            padding: "16px 24px",
            borderBottom: "1px solid var(--color-border)",
            background: "white",
          }}
        >
          <strong>Surveillance Platform</strong>
        </header>
        <main style={{ maxWidth: 960, margin: "0 auto", padding: 24 }}>{children}</main>
      </body>
    </html>
  );
}
