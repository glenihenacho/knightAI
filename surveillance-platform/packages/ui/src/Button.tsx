"use client";

import type { CSSProperties, ReactNode } from "react";
import { useRef } from "react";

type Variant = "primary" | "secondary";

interface BaseProps {
  variant?: Variant;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

interface ButtonProps extends BaseProps {
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

interface AnchorProps extends BaseProps {
  href: string;
  target?: string;
  rel?: string;
}

const sharedStyle: CSSProperties = {
  position: "relative",
  isolation: "isolate",
  overflow: "hidden",
  display: "inline-flex",
  alignItems: "center",
  gap: 10,
  padding: "13px 20px",
  border: "1px solid var(--rule-2)",
  background: "transparent",
  color: "var(--ink)",
  fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
  fontSize: 12,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  textDecoration: "none",
  cursor: "pointer",
};

const primaryStyle: CSSProperties = {
  ...sharedStyle,
  background: "#ffffff",
  color: "#1a1305",
  border: "1px solid rgba(233, 184, 100, 0.4)",
  fontWeight: 500,
  boxShadow: "0 1px 2px rgba(0,0,0,.06), 0 8px 22px -6px rgba(0,0,0,.22)",
};

function trackPointer(el: HTMLElement, e: PointerEvent) {
  const r = el.getBoundingClientRect();
  el.style.setProperty("--mx", `${(((e.clientX - r.left) / r.width) * 100).toFixed(2)}%`);
  el.style.setProperty("--my", `${(((e.clientY - r.top) / r.height) * 100).toFixed(2)}%`);
}

export function Button(props: ButtonProps | AnchorProps) {
  const variant: Variant = props.variant ?? "secondary";
  const ref = useRef<HTMLElement | null>(null);
  const style = { ...(variant === "primary" ? primaryStyle : sharedStyle), ...(props.style ?? {}) };
  const className = `gc-btn ${variant === "primary" ? "gc-btn-primary" : ""} ${props.className ?? ""}`.trim();

  const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    if (ref.current) trackPointer(ref.current, e.nativeEvent as PointerEvent);
  };

  if ("href" in props) {
    return (
      <a
        ref={(el) => {
          ref.current = el;
        }}
        href={props.href}
        target={props.target}
        rel={props.rel}
        className={className}
        style={style}
        onPointerMove={onPointerMove}
      >
        {props.children}
      </a>
    );
  }
  return (
    <button
      ref={(el) => {
        ref.current = el;
      }}
      type={props.type ?? "button"}
      disabled={props.disabled}
      onClick={props.onClick}
      className={className}
      style={style}
      onPointerMove={onPointerMove}
    >
      {props.children}
    </button>
  );
}
