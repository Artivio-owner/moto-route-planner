// История запросов в браузере на 30 дней: ADR-0005, задача X-08.
// Сохраняем только в localStorage этого браузера; на сервер ничего не уходит.
import { tripDefaults } from "../config";

export interface HistoryEntry {
  /** Строка состояния из ссылки (#r=...). */
  encoded: string;
  title: string;
  startDate: string;
  savedAt: number;
}

const KEY = "versta.history.v1";
const DAY_MS = 86400000;

export interface HistoryStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function storage(): HistoryStore | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readHistory(
  now = Date.now(),
  store: HistoryStore | null = storage(),
): HistoryEntry[] {
  if (!store) return [];
  try {
    const entries = JSON.parse(store.getItem(KEY) ?? "[]") as HistoryEntry[];
    const fresh = entries.filter((e) => now - e.savedAt < tripDefaults.history.keepDays * DAY_MS);
    if (fresh.length !== entries.length) store.setItem(KEY, JSON.stringify(fresh));
    return fresh;
  } catch {
    return [];
  }
}

/** Добавляет запись в начало; тот же маршрут не дублируется. */
export function saveToHistory(
  entry: Omit<HistoryEntry, "savedAt">,
  now = Date.now(),
  store: HistoryStore | null = storage(),
): HistoryEntry[] {
  if (!store) return [];
  const rest = readHistory(now, store).filter(
    (e) => e.encoded !== entry.encoded && e.title !== entry.title,
  );
  const next = [{ ...entry, savedAt: now }, ...rest].slice(0, tripDefaults.history.maxEntries);
  try {
    store.setItem(KEY, JSON.stringify(next));
  } catch {
    // Хранилище переполнено или запрещено: история просто не сохранится.
  }
  return next;
}

export function clearHistory(store: HistoryStore | null = storage()): void {
  try {
    store?.setItem(KEY, "[]");
  } catch {
    // ничего
  }
}
