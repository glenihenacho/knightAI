import type { CSSProperties, ReactNode } from "react";

export function Card({
  children,
  style,
  padded = true,
}: {
  children: ReactNode;
  style?: CSSProperties;
  padded?: boolean;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--rule-2)",
        background: "linear-gradient(180deg, #13130f 0%, #0c0c0a 100%)",
        boxShadow: "0 30px 80px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.04)",
        padding: padded ? 24 : 0,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
