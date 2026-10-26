// Отрезок маршрута через GraphHopper: спайк S-01 (docs/spikes/s01-graphhopper.md).

import type { RoadClass, Segment } from "@versta/calc";
import { UserFacingError } from "./errors.js";
import { cumulativeKm, haversineKm, simplifyIndices, type LonLat } from "./geometry.js";

export interface LatLon {
  lat: number;
  lon: number;
}

type Interval<T> = [from: number, to: number, value: T];

interface GhPath {
  distance: number;
  time: number;
  points: { coordinates: number[][] };
  details: {
    road_class?: Interval<string>[];
    road_environment?: Interval<string>[];
    toll?: Interval<string>[];
    time?: Interval<number>[];
  };
}

export interface LegResult {
  distanceKm: number;
  segments: Segment[];
  /** Упрощённая геометрия для карты, GPX и PDF. */
  geometry: LonLat[];
  /** Километры от начала отрезка для каждой точки geometry. */
  geometryKm: number[];
  /** Полная геометрия: нужна только для часовых поясов, наружу не отдаётся. */
  fullGeometry: LonLat[];
  fullKm: number[];
}

/** Классы GraphHopper → наши 4 класса (спецификация 14, раздел 2). */
export function mapRoadClass(ghClass: string | undefined): RoadClass {
  switch (ghClass) {
    case "motorway":
      return "motorway";
    case "trunk":
      return "trunk";
    case "primary":
    case "secondary":
      return "regional";
    default:
      return "local";
  }
}

/** Интервал детали, покрывающий отрезок [i, i+1]; интервалы идут по порядку, курсор хранится снаружи. */
function findInterval<T>(
  intervals: Interval<T>[] | undefined,
  i: number,
  cursor: { at: number },
): Interval<T> | undefined {
  if (!intervals) return undefined;
  while (cursor.at < intervals.length && (intervals[cursor.at] as Interval<T>)[1] <= i) cursor.at++;
  const interval = intervals[cursor.at];
  return interval && interval[0] <= i ? interval : undefined;
}

function lookup<T>(
  intervals: Interval<T>[] | undefined,
  i: number,
  cursor: { at: number },
): T | undefined {
  return findInterval(intervals, i, cursor)?.[2];
}

/** Допуск упрощения линии для показа: 15 м. */
const SIMPLIFY_TOLERANCE_KM = 0.015;

export function pathToLeg(path: GhPath): LegResult {
  const points = path.points.coordinates.map((c) => [c[0], c[1]] as LonLat);
  const fullKm = cumulativeKm(points);
  const { details } = path;

  // Время парома из GraphHopper распределяем по точкам интервала пропорционально длине.
  const intervalKm = (from: number, to: number): number => (fullKm[to] ?? 0) - (fullKm[from] ?? 0);

  const cursors = { cls: { at: 0 }, env: { at: 0 }, toll: { at: 0 }, time: { at: 0 } };
  const segments: Segment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const distanceKm = haversineKm(points[i] as LonLat, points[i + 1] as LonLat);
    if (distanceKm === 0) continue;
    const ferry = lookup(details.road_environment, i, cursors.env) === "ferry";
    const toll = (lookup(details.toll, i, cursors.toll) ?? "no") !== "no";
    const roadClass = mapRoadClass(lookup(details.road_class, i, cursors.cls));
    let fixedDurationH: number | undefined;
    const timeInterval = findInterval(details.time, i, cursors.time);
    if (ferry && timeInterval) {
      const share = distanceKm / Math.max(intervalKm(timeInterval[0], timeInterval[1]), 1e-9);
      fixedDurationH = (timeInterval[2] * share) / 3600000;
    }
    const last = segments[segments.length - 1];
    if (
      last &&
      last.roadClass === roadClass &&
      (last.ferry ?? false) === ferry &&
      (last.toll ?? false) === toll
    ) {
      last.distanceKm += distanceKm;
      if (fixedDurationH !== undefined)
        last.fixedDurationH = (last.fixedDurationH ?? 0) + fixedDurationH;
      continue;
    }
    const segment: Segment = { distanceKm, roadClass };
    if (ferry) segment.ferry = true;
    if (toll) segment.toll = true;
    if (fixedDurationH !== undefined) segment.fixedDurationH = fixedDurationH;
    segments.push(segment);
  }

  const kept = simplifyIndices(points, SIMPLIFY_TOLERANCE_KM);
  return {
    distanceKm: fullKm[fullKm.length - 1] ?? 0,
    segments,
    geometry: kept.map((i) => points[i] as LonLat),
    geometryKm: kept.map((i) => fullKm[i] ?? 0),
    fullGeometry: points,
    fullKm,
  };
}

/** Понятное сообщение по ответу GraphHopper (R-07). */
export function explainGraphHopperError(message: string): UserFacingError {
  const pointMatch = /Point (\d+)/.exec(message);
  const pointText = pointMatch ? `Точка ${Number(pointMatch[1]) + 1}` : "Одна из точек";
  if (/out of bounds|Cannot find point/i.test(message)) {
    return new UserFacingError(
      `${pointText} вне зоны покрытия или далеко от дорог. Сейчас доступна Россия; передвиньте точку ближе к дороге`,
      422,
      "point_not_found",
    );
  }
  if (/Connection between locations not found/i.test(message)) {
    return new UserFacingError(
      "Маршрут не найден: между точками нет дороги, по которой можно проехать. Попробуйте разрешить грунт или передвинуть точки",
      422,
      "no_route",
    );
  }
  return new UserFacingError(
    "Сервис маршрутов не смог построить путь. Попробуйте ещё раз позже",
    502,
    "engine_error",
  );
}

export interface GraphHopperClient {
  leg(from: LatLon, to: LatLon, profile: string): Promise<LegResult>;
}

export function createGraphHopperClient(
  baseUrl: string,
  timeoutMs: number,
  fetchImpl: typeof fetch = fetch,
): GraphHopperClient {
  return {
    async leg(from, to, profile) {
      const body: Record<string, unknown> = {
        points: [
          [from.lon, from.lat],
          [to.lon, to.lat],
        ],
        profile,
        points_encoded: false,
        instructions: false,
        details: ["road_class", "road_environment", "toll", "time"],
      };
      if (profile === "moto_curvy") body["ch.disable"] = true;
      let response: Response;
      try {
        response = await fetchImpl(`${baseUrl}/route`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        if (error instanceof Error && error.name === "TimeoutError") {
          throw new UserFacingError(
            "Расчёт занял слишком много времени. Попробуйте разбить маршрут или повторить позже",
            504,
            "timeout",
          );
        }
        throw new UserFacingError(
          "Сервис маршрутов недоступен. Попробуйте позже",
          503,
          "engine_unavailable",
        );
      }
      const json = (await response.json()) as { paths?: GhPath[]; message?: string };
      const path = json.paths?.[0];
      if (!response.ok || !path) throw explainGraphHopperError(json.message ?? "");
      return pathToLeg(path);
    },
  };
}
