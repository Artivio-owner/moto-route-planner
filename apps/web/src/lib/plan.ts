// Расчёт плана поездки из состояния и ответа API.
import {
  computeBudget,
  countryMarks,
  planTrip,
  type Budget,
  type Leg,
  type PriceMark,
  type TripPlan,
} from "@versta/calc";
import {
  budgetDefaults,
  defaultFuelPrice,
  exchangeRate,
  hasCountryFuelPrice,
  stopSettings,
} from "../config";
import { completePoints, type PlannerState } from "../state/planner";
import type { LonLat, PoiKind, RoutePoi, RouteResponse } from "./api";

export interface PlanResult {
  plan: TripPlan;
  fuelPriceRub: number;
  rubPerUsd: number;
  /** Цена и курс по умолчанию или изменены пользователем. */
  fuelPriceEdited: boolean;
  rateEdited: boolean;
  budget: Budget;
  /** Цены топлива по странам маршрута, ₽/л (v0.2); ваша цена действует в России. */
  countryFuelPrices: { country: string; priceRub: number }[];
  /** Цены бюджета, по которым посчитано, и признак «изменено пользователем». */
  budgetPrices: {
    room: number;
    food: number;
    coffee: number;
    roomEdited: boolean;
    foodEdited: boolean;
    coffeeEdited: boolean;
  };
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
  const zones = route.zones.length ? route.zones : [{ fromKm: 0, timeZone: "Europe/Moscow" }];
  // Ваша цена топлива действует в России и там, где страна не определена;
  // в странах v0.2 берётся цена по умолчанию из data/ (правится в админке).
  const priceFor = (country: string | null): number =>
    country && country !== "RU" && hasCountryFuelPrice(country)
      ? defaultFuelPrice(state.fuelType, country)
      : fuelPriceRub;
  const marks = countryMarks(zones);
  const fuelPriceMarks: PriceMark[] = marks.map((m) => ({
    fromKm: m.fromKm,
    priceRub: priceFor(m.country),
  }));
  const countryFuelPrices = [...new Set(marks.map((m) => m.country))]
    .filter((c): c is string => c !== null)
    .map((country) => ({ country, priceRub: priceFor(country) }));
  const plan = planTrip({
    legs,
    split: state.split,
    profile: state.profile,
    group: { people: state.people, motorcycles: state.motorcycles },
    startDate: state.startDate,
    zones,
    fuelPriceRub,
    fuelPriceMarks,
    stops: stopSettings,
    positionAtKm: (km) => {
      const [lon, lat] = pointAtKm(line, km);
      return { lat, lon };
    },
    restAfterDays: state.restAfterDays ?? [],
    // Слой АЗС есть на сервере: заправки на реальных АЗС (v0.3, P-07).
    ...(route.pois
      ? {
          fuelStationsKm: route.pois.filter((p) => p.kind === "fuel").map((p) => p.km),
          // Границы дней тянутся к населённым пунктам (C-10).
          places: route.pois.flatMap((p) => {
            const rank = PLACE_RANK[p.kind];
            return rank && p.name ? [{ km: p.km, name: p.name, rank }] : [];
          }),
        }
      : {}),
  });
  const b = state.budget;
  const budgetPrices = {
    room: b.roomPriceRub ?? budgetDefaults.lodging.pricePerRoomRub[b.lodging],
    food: b.foodPriceRub ?? budgetDefaults.food.perPersonDayRub[b.food],
    coffee: b.coffeePriceRub ?? budgetDefaults.coffee.priceRub,
    roomEdited: b.roomPriceRub !== undefined,
    foodEdited: b.foodPriceRub !== undefined,
    coffeeEdited: b.coffeePriceRub !== undefined,
  };
  const budget = computeBudget({
    days: plan.days.length,
    nights: plan.nights,
    finalNight: b.finalNight,
    people: plan.group.people,
    // Вдвоём по умолчанию один номер (спецификация 07); одному второй номер не нужен.
    rooms: plan.group.people === 1 ? 1 : b.rooms,
    roomPriceRub: budgetPrices.room,
    foodPerPersonDayRub: budgetPrices.food,
    fuelCostRub: plan.fuelCostRub,
    fuelStops: plan.fuelStops,
    coffee: b.coffee,
    coffeePriceRub: budgetPrices.coffee,
    otherRub: b.otherRub,
    reservePct: b.reservePct,
  });
  return {
    plan,
    fuelPriceRub,
    rubPerUsd: rateOf(state),
    fuelPriceEdited: state.fuelPriceRub !== undefined,
    rateEdited: state.rubPerUsd !== undefined,
    budget,
    budgetPrices,
    countryFuelPrices,
  };
}

export interface RouteLine {
  points: LonLat[];
  km: number[];
  /** Высоты точек, м, если они есть у всех отрезков (E-01). */
  elevation?: number[];
}

/** Геометрия всего маршрута с километрами от старта. */
export function routeLine(route: RouteResponse): RouteLine {
  const points: LonLat[] = [];
  const km: number[] = [];
  const elevation: number[] = [];
  const withElevation = route.legs.length > 0 && route.legs.every((l) => l.elevation);
  let offset = 0;
  for (const leg of route.legs) {
    leg.geometry.forEach((p, i) => {
      if (i === 0 && points.length) return;
      points.push(p);
      km.push(offset + (leg.geometryKm[i] ?? 0));
      if (withElevation) elevation.push(leg.elevation?.[i] ?? 0);
    });
    offset += leg.distanceKm;
  }
  return withElevation ? { points, km, elevation } : { points, km };
}

export interface ElevationStats {
  ascentM: number;
  descentM: number;
  minM: number;
  maxM: number;
}

/** Набор и сброс высоты на участке [fromKm, toKm] по точкам профиля; null без данных высот. */
export function elevationStats(
  line: RouteLine,
  fromKm: number,
  toKm: number,
): ElevationStats | null {
  const { elevation, km } = line;
  if (!elevation?.length) return null;
  let ascentM = 0;
  let descentM = 0;
  let minM = Infinity;
  let maxM = -Infinity;
  let prev: number | null = null;
  for (let i = 0; i < elevation.length; i++) {
    const k = km[i] ?? 0;
    if (k < fromKm || k > toKm) continue;
    const e = elevation[i] ?? 0;
    minM = Math.min(minM, e);
    maxM = Math.max(maxM, e);
    if (prev !== null) {
      if (e > prev) ascentM += e - prev;
      else descentM += prev - e;
    }
    prev = e;
  }
  return prev === null ? null : { ascentM, descentM, minM, maxM };
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

export type LodgingKind = Exclude<PoiKind, "fuel" | "city" | "town" | "village">;

const LODGING_KINDS = new Set<PoiKind>([
  "hotel",
  "motel",
  "guest_house",
  "hostel",
  "camp_site",
  "chalet",
]);

export function isLodging(poi: RoutePoi): poi is RoutePoi & { kind: LodgingKind } {
  return LODGING_KINDS.has(poi.kind);
}

const PLACE_RANK: Partial<Record<PoiKind, 1 | 2 | 3>> = { village: 1, town: 2, city: 3 };

export const LODGING_KIND_LABELS: Record<LodgingKind, string> = {
  hotel: "гостиница",
  motel: "мотель",
  guest_house: "гостевой дом",
  hostel: "хостел",
  camp_site: "кемпинг",
  chalet: "домик",
};

/** Ночлег у финиша дня: жильё в пределах withinKm по маршруту, ближайшее первым (P-07). */
export function lodgingNear(
  pois: readonly RoutePoi[] | undefined,
  atKm: number,
  limit = 3,
  withinKm = 15,
): RoutePoi[] {
  return (pois ?? [])
    .filter((p) => isLodging(p) && Math.abs(p.km - atKm) <= withinKm)
    .sort((a, b) => Math.abs(a.km - atKm) + a.offKm - (Math.abs(b.km - atKm) + b.offKm))
    .slice(0, limit);
}

/** Число АЗС на участке (fromKm, toKm]; null без слоя POI. */
export function fuelStationsBetween(
  pois: readonly RoutePoi[] | undefined,
  fromKm: number,
  toKm: number,
): number | null {
  if (!pois) return null;
  return pois.filter((p) => p.kind === "fuel" && p.km > fromKm && p.km <= toKm).length;
}

/** «Гостиница «Дорога», 1,2 км от дороги» для списка ночлега. */
export function describeLodging(poi: RoutePoi): string {
  const kind = isLodging(poi) ? LODGING_KIND_LABELS[poi.kind] : "АЗС";
  const name = poi.name ? `${poi.name} (${kind})` : kind[0]?.toUpperCase() + kind.slice(1);
  const off =
    poi.offKm < 0.3
      ? "у дороги"
      : `${poi.offKm.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} км от дороги`;
  return `${name}, ${off}`;
}
