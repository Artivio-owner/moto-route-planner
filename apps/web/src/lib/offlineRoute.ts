// Последний маршрут без сети (X-07, v0.3): ответ API последнего расчёта хранится
// в localStorage этого браузера и показывается, если сети нет. На сервер ничего не уходит (ADR-0005).
import type { RouteResponse } from "./api";

const KEY = "versta.lastRoute.v1";

interface Saved {
  key: string;
  savedAt: number;
  route: RouteResponse;
}

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Запоминает ответ для ключа запроса. Слишком большой маршрут молча не сохраняется. */
export function saveLastRoute(key: string, route: RouteResponse, now = Date.now()): void {
  try {
    storage()?.setItem(KEY, JSON.stringify({ key, savedAt: now, route } satisfies Saved));
  } catch {
    // Переполнение хранилища: офлайн-копии не будет, расчёт работает как обычно.
  }
}

/** Сохранённый ответ, если он для того же запроса (те же точки и настройки дорог). */
export function loadLastRoute(key: string): { route: RouteResponse; savedAt: number } | null {
  try {
    const raw = storage()?.getItem(KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Saved;
    return saved.key === key && saved.route ? { route: saved.route, savedAt: saved.savedAt } : null;
  } catch {
    return null;
  }
}
