import { useEffect, useId, useRef, useState } from "react";
import { searchPlaces, type Place } from "../lib/api";

interface Props {
  label: string;
  value: string;
  placeholder: string;
  confirmed: boolean;
  onType(name: string): void;
  onPick(place: Place): void;
}

/** Поле адреса с подсказками (R-03): список открывается при вводе от 2 символов. */
export function PlaceInput({ label, value, placeholder, confirmed, onType, onPick }: Props) {
  const listId = useId();
  const [options, setOptions] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [message, setMessage] = useState("");
  const lastQuery = useRef("");

  useEffect(() => {
    const query = value.trim();
    if (confirmed || query.length < 2 || query === lastQuery.current) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      lastQuery.current = query;
      try {
        const places = await searchPlaces(query, controller.signal);
        setOptions(places);
        setActive(places.length ? 0 : -1);
        setMessage(
          places.length ? "" : "Ничего не нашли. Уточните название или поставьте точку на карте",
        );
        setOpen(true);
      } catch (error) {
        if (controller.signal.aborted) return;
        setOptions([]);
        setMessage(error instanceof Error ? error.message : "Поиск недоступен");
        setOpen(true);
      }
    }, 300);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [value, confirmed]);

  function pick(place: Place) {
    lastQuery.current = place.name;
    setOpen(false);
    setOptions([]);
    onPick(place);
  }

  return (
    <div className="combo">
      <label className="visually-hidden" htmlFor={`${listId}-input`}>
        {label}
      </label>
      <input
        id={`${listId}-input`}
        className="input"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          lastQuery.current = "";
          onType(e.target.value);
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, options.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter" && options[active]) {
            e.preventDefault();
            pick(options[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && (
        <ul className="suggestions" id={listId} role="listbox" aria-label={`Подсказки: ${label}`}>
          {options.map((place, i) => (
            <li
              key={`${place.lat},${place.lon},${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(place);
              }}
            >
              {place.name}
              {place.description && <small>{place.description}</small>}
            </li>
          ))}
          {message && <li aria-disabled="true">{message}</li>}
        </ul>
      )}
    </div>
  );
}
