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
