import { useEffect, useId, useState } from "react";

interface Props {
  label: string;
  value: number;
  min: number;
  max: number;
  unit?: string;
  onChange(value: number): void;
}

const parse = (text: string): number => Number(text.replace(",", ".").replace(/\s/g, ""));
const show = (value: number): string => String(value).replace(".", ",");

/** Числовое поле: принимает запятую, применяет значение при выходе из поля или Enter. */
export function NumberField({ label, value, min, max, unit, onChange }: Props) {
  const id = useId();
  const [text, setText] = useState(show(value));
  const [error, setError] = useState("");

  useEffect(() => setText(show(value)), [value]);

  function commit() {
    const number = parse(text);
    if (!Number.isFinite(number) || number < min || number > max) {
      setError(`От ${show(min)} до ${show(max)}`);
      return;
    }
    setError("");
    if (number !== value) onChange(number);
  }

  return (
    <label className="field" htmlFor={id}>
      <span>
        {label}
        {unit ? `, ${unit}` : ""}
      </span>
      <input
        id={id}
        className="input"
        inputMode="decimal"
        value={text}
        aria-invalid={error ? true : undefined}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
      />
      {error && <small style={{ color: "var(--danger)" }}>{error}</small>}
    </label>
  );
}
