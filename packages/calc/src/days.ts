// Разбивка маршрута по дням: docs/08-day-split-spec.md; задача C-03.
// В v0.1 два режима: по километрам и вручную (ночёвки в промежуточных точках).

import { totalDistanceKm, type Segment } from "./roads.js";

/** Отрезок маршрута между соседними точками. */
export interface Leg {
  segments: Segment[];
  /** Ночёвка в конечной точке отрезка (только для ручного режима). */
  overnight?: boolean;
}

export type SplitMode =
  | { mode: "km"; maxKmPerDay: number }
  | { mode: "manual" }
  /** По времени в пути: ходовое время и остановки (C-08). */
  | { mode: "hours"; maxHoursPerDay: number }
  /** По числу дней, примерно поровну по времени (C-09). */
  | { mode: "days"; days: number };

/** Погрешность сравнения километров, чтобы 900 / 300 давало ровно 3 дня. */
const EPS_KM = 1e-6;

/** Отметки концов дней для режимов без расчёта времени: по километрам и вручную. */
export function dayBoundariesKm(
  legs: readonly Leg[],
  split: Extract<SplitMode, { mode: "km" | "manual" }>,
): number[] {
  const total = legs.reduce((sum, leg) => sum + totalDistanceKm(leg.segments), 0);
  if (split.mode === "km") {
    if (!Number.isFinite(split.maxKmPerDay) || split.maxKmPerDay <= 0) {
      throw new RangeError("Дневной лимит, км, должен быть больше 0");
    }
    const boundaries: number[] = [];
    for (let km = split.maxKmPerDay; km < total - EPS_KM; km += split.maxKmPerDay) {
      boundaries.push(km);
    }
    boundaries.push(total);
    return boundaries;
  }
  const boundaries: number[] = [];
  let km = 0;
  legs.forEach((leg, index) => {
    km += totalDistanceKm(leg.segments);
    const isLast = index === legs.length - 1;
    if (leg.overnight && !isLast && km > EPS_KM) boundaries.push(km);
  });
  boundaries.push(total);
  return boundaries;
}

/** Населённый пункт на маршруте для привязки границ дня (C-10). */
export interface PlaceOnRoute {
  km: number;
  name: string;
  /** Крупнее: city > town > village; при равном расстоянии берём крупнее. */
  rank: 1 | 2 | 3;
}

/** Допуск привязки: 10% длины дня (спецификация 08, значение уточняется на практике). */
export const SNAP_TOLERANCE_SHARE = 0.1;

/**
 * Сдвигает автоматические границы дней (кроме финиша) к ближайшему населённому пункту
 * в пределах допуска, чтобы ночёвка не оказалась «в поле». Порядок границ сохраняется.
 * Возвращает границы и названия пунктов (пустая строка: пункта рядом нет).
 */
export function snapBoundariesToPlaces(
  boundaries: readonly number[],
  places: readonly PlaceOnRoute[],
  toleranceShare = SNAP_TOLERANCE_SHARE,
): { boundaries: number[]; names: string[] } {
  const result = [...boundaries];
  const names = boundaries.map(() => "");
  for (let i = 0; i < result.length - 1; i++) {
    const end = result[i] ?? 0;
    const start = i === 0 ? 0 : (result[i - 1] ?? 0);
    const next = boundaries[i + 1] ?? end;
    const tolerance = (end - start) * toleranceShare;
    let best: PlaceOnRoute | undefined;
    for (const place of places) {
      const distance = Math.abs(place.km - end);
      // Граница должна остаться между соседними, иначе день схлопнется.
      if (distance > tolerance || place.km <= start + 1 || place.km >= next - 1) continue;
      const bestDistance = best ? Math.abs(best.km - end) : Infinity;
      if (
        distance < bestDistance - 1 ||
        (Math.abs(distance - bestDistance) <= 1 && best && place.rank > best.rank)
      ) {
        best = place;
      }
    }
    if (best) {
      result[i] = best.km;
      names[i] = best.name;
    }
  }
  return { boundaries: result, names };
}
