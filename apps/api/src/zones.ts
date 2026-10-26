// Часовые пояса вдоль маршрута: задача C-15. Пояса по координатам: @photostructure/tz-lookup (CC0).
// Точность у границ поясов ограничена (база упрощённая): записано в docs/14-trip-parameters-spec.md.

import tzlookup from "@photostructure/tz-lookup";
import type { ZoneMark } from "@versta/calc";
import type { LonLat } from "./geometry.js";

const SAMPLE_STEP_KM = 20;

function zoneAt(point: LonLat): string {
  return tzlookup(point[1], point[0]);
}

/** Отметки смены пояса по полной геометрии маршрута; offsetKm сдвигает отметки для следующих отрезков. */
export function zoneMarks(
  points: readonly LonLat[],
  km: readonly number[],
  offsetKm = 0,
): ZoneMark[] {
  const first = points[0];
  if (!first) return [];
  const marks: ZoneMark[] = [{ fromKm: offsetKm, timeZone: zoneAt(first) }];
  let prevIndex = 0;
  let prevZone = marks[0]?.timeZone as string;
  let nextSampleKm = SAMPLE_STEP_KM;
  for (let i = 1; i < points.length; i++) {
    const atEnd = i === points.length - 1;
    if ((km[i] ?? 0) < nextSampleKm && !atEnd) continue;
    nextSampleKm = (km[i] ?? 0) + SAMPLE_STEP_KM;
    const zone = zoneAt(points[i] as LonLat);
    if (zone !== prevZone) {
      // Бинарный поиск места смены пояса между двумя выборками.
      let lo = prevIndex;
      let hi = i;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (zoneAt(points[mid] as LonLat) === prevZone) lo = mid;
        else hi = mid;
      }
      marks.push({ fromKm: offsetKm + (km[hi] ?? 0), timeZone: zone });
      prevZone = zone;
    }
    prevIndex = i;
  }
  return marks;
}
