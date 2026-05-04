import type { ReactNode } from "react";
import "@surveillance/ui/styles.css";

export const metadata = {
  title: "Surveillance Platform",
  description: "Agentic surveillance for existing CCTV",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
