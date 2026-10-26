// Расчёт плана поездки из состояния и ответа API.
import { planTrip, type Leg, type TripPlan } from "@versta/calc";
import { defaultFuelPrice, exchangeRate, stopSettings } from "../config";
import { completePoints, type PlannerState } from "../state/planner";
import type { LonLat, RouteResponse } from "./api";

export interface PlanResult {
  plan: TripPlan;
  fuelPriceRub: number;
  rubPerUsd: number;
  /** Цена и курс по умолчанию или изменены пользователем. */
  fuelPriceEdited: boolean;
  rateEdited: boolean;
}

export function fuelPriceOf(state: PlannerState): number {
  return state.fuelPriceRub ?? defaultFuelPrice(state.fuelType);
}

export function rateOf(state: PlannerState): number {
  return state.rubPerUsd ?? exchangeRate.rubPerUsd;
}

export function computePlan(state: PlannerState, route: RouteResponse): PlanResult {
  const points = completePoints(state);
  const legs: Leg[] = route.legs.map((leg, i) => {
    const endPoint = points[i + 1];
    const result: Leg = { segments: leg.segments };
    if (endPoint?.overnight) result.overnight = true;
    return result;
  });
  const fuelPriceRub = fuelPriceOf(state);
  const line = routeLine(route);
  const plan = planTrip({
    legs,
    split: state.split,
    profile: state.profile,
    group: { people: state.people, motorcycles: state.motorcycles },
    startDate: state.startDate,
    zones: route.zones.length ? route.zones : [{ fromKm: 0, timeZone: "Europe/Moscow" }],
    fuelPriceRub,
    stops: stopSettings,
    positionAtKm: (km) => {
      const [lon, lat] = pointAtKm(line, km);
      return { lat, lon };
    },
  });
  return {
    plan,
    fuelPriceRub,
    rubPerUsd: rateOf(state),
    fuelPriceEdited: state.fuelPriceRub !== undefined,
    rateEdited: state.rubPerUsd !== undefined,
  };
}

/** Геометрия всего маршрута с километрами от старта. */
export function routeLine(route: RouteResponse): { points: LonLat[]; km: number[] } {
  const points: LonLat[] = [];
  const km: number[] = [];
  let offset = 0;
  for (const leg of route.legs) {
    leg.geometry.forEach((p, i) => {
      if (i === 0 && points.length) return;
      points.push(p);
      km.push(offset + (leg.geometryKm[i] ?? 0));
    });
    offset += leg.distanceKm;
  }
  return { points, km };
}

/** Точка на линии на отметке atKm (линейная интерполяция). */
export function pointAtKm(line: { points: LonLat[]; km: number[] }, atKm: number): LonLat {
  const { points, km } = line;
  if (!points.length) return [0, 0];
  if (atKm <= (km[0] ?? 0)) return points[0] as LonLat;
  for (let i = 1; i < points.length; i++) {
    const k1 = km[i] ?? 0;
    if (k1 >= atKm) {
      const k0 = km[i - 1] ?? 0;
      const t = k1 === k0 ? 0 : (atKm - k0) / (k1 - k0);
      const a = points[i - 1] as LonLat;
      const b = points[i] as LonLat;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
  }
  return points[points.length - 1] as LonLat;
}

/** Часть линии между отметками (для GPX и карты дня). */
export function sliceLine(
  line: { points: LonLat[]; km: number[] },
  fromKm: number,
  toKm: number,
): LonLat[] {
  const result: LonLat[] = [pointAtKm(line, fromKm)];
  line.points.forEach((p, i) => {
    const k = line.km[i] ?? 0;
    if (k > fromKm && k < toKm) result.push(p);
  });
  result.push(pointAtKm(line, toKm));
  return result;
}

export function bounds(points: readonly LonLat[]): [LonLat, LonLat] | null {
  if (!points.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return [
    [minX, minY],
    [maxX, maxY],
  ];
}
