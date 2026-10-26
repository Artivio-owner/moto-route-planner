import type { HistoryEntry } from "../state/history";
import { formatDate } from "../lib/format";

interface Props {
  entries: HistoryEntry[];
  onOpen(entry: HistoryEntry): void;
  onClear(): void;
}

/** Последние маршруты из этого браузера (X-08). */
export function HistoryCard({ entries, onOpen, onClear }: Props) {
  if (!entries.length) return null;
  return (
    <section className="card" aria-labelledby="history-title">
      <h2 id="history-title">Недавние маршруты</h2>
      <ul className="history">
        {entries.map((entry) => (
          <li key={entry.encoded}>
            <button type="button" onClick={() => onOpen(entry)}>
              {entry.title}
              <small>старт {formatDate(entry.startDate)}</small>
            </button>
          </li>
        ))}
      </ul>
      <p className="hint">
        Хранятся только в этом браузере 30 дней.{" "}
        <button type="button" className="link-btn" onClick={onClear}>
          Очистить
        </button>
      </p>
    </section>
  );
}
