"use client";

import { useEffect, useState } from "react";

/**
 * Number field that keeps what the person typed (e.g. "12.") while committing valid numbers upward,
 * and snaps back to the formatted value on blur.
 */
export function NumInput({
  value,
  onCommit,
  format = (n) => String(n),
  parse = (s) => parseFloat(s),
  className = "field",
  ...rest
}: {
  value: number;
  onCommit: (n: number) => void;
  format?: (n: number) => string;
  parse?: (s: string) => number;
  className?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">) {
  const [text, setText] = useState(format(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(format(value));
  }, [value, focused, format]);

  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      className={className}
      value={text}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        setText(format(value));
      }}
      onChange={(e) => {
        setText(e.target.value);
        const n = parse(e.target.value);
        if (Number.isFinite(n) && n >= 0) onCommit(n);
      }}
    />
  );
}
