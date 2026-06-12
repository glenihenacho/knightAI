import type { CSSProperties, ChangeEvent } from "react";

export const fieldLabelStyle: CSSProperties = {
  fontFamily: "var(--font-mono), 'JetBrains Mono', monospace",
  fontSize: 11,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "var(--ink-2)",
};

export const fieldControlStyle: CSSProperties = {
  display: "block",
  width: "100%",
  padding: "10px 12px",
  marginTop: 6,
  border: "1px solid var(--rule-2)",
  background: "rgba(255,255,255,0.02)",
  color: "var(--ink)",
  fontSize: 14,
  boxSizing: "border-box",
};

interface InputProps {
  label: string;
  type?: "text" | "email" | "number" | "url";
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  autoFocus?: boolean;
  style?: CSSProperties;
}

export function Input({
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  required,
  autoFocus,
  style,
}: InputProps) {
  return (
    <label style={fieldLabelStyle}>
      {label}
      <input
        type={type}
        value={value}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        autoFocus={autoFocus}
        style={{ ...fieldControlStyle, ...style }}
      />
    </label>
  );
}
