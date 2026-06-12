import type { CSSProperties, ChangeEvent } from "react";
import { fieldControlStyle, fieldLabelStyle } from "./Input.js";

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  required?: boolean;
  disabled?: boolean;
  style?: CSSProperties;
}

export function Select({ label, value, onChange, options, required, disabled, style }: SelectProps) {
  return (
    <label style={fieldLabelStyle}>
      {label}
      <select
        value={value}
        onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}
        required={required}
        disabled={disabled}
        style={{ ...fieldControlStyle, cursor: disabled ? "not-allowed" : "pointer", ...style }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
