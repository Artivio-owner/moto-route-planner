interface Option<T> {
  value: T;
  label: string;
}

interface Props<T> {
  label: string;
  options: Option<T>[];
  value: T;
  onChange(value: T): void;
}

/** Группа чипов-переключателей. */
export function Chips<T extends string | number>({ label, options, value, onChange }: Props<T>) {
  return (
    <div className="field" role="group" aria-label={label}>
      <span>{label}</span>
      <div className="chips">
        {options.map((option) => (
          <button
            key={String(option.value)}
            type="button"
            className="chip"
            aria-pressed={option.value === value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
