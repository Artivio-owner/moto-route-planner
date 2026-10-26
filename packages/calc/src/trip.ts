// Сводный расчёт поездки по дням: время, заправки, топливо, местное время.
// Спецификации: docs/08-day-split-spec.md, docs/14-trip-parameters-spec.md.

import { dayBoundariesKm, type Leg, type SplitMode } from "./days.js";
import { fuelCost, fuelLiters, fuelStopsKm, rangeKm } from "./fuel.js";
import { normalizeGroup, type Group } from "./group.js";
import { drivingTimeH, sliceSegments, type Segment, type Speeds } from "./roads.js";
import { addDays, utcOffsetMinutes, zonedTimeToInstant } from "./time.js";

export interface MotoProfile {
  tankL: number;
  consumptionLPer100Km: number;
  speeds: Speeds;
  /** Дневной лимит, км. */
  dailyLimitKm: number;
  /** Дневной лимит, ч (ходовое время и остановки). */
  dailyLimitH: number;
  /** Порог предупреждения о большой нагрузке, км. */
  heavyDayKm: number;
}

/** Остановки и старт дня: вопрос 14 в docs/12-open-questions.md. */
export interface StopSettings {
  /** Старт дня, минут от полуночи по местному времени. */
  dayStartMin: number;
  fuelStopMin: number;
  lunchMin: number;
  /** Обед добавляется, если ходовое время дня не меньше этого значения, ч. */
  lunchAfterDrivingH: number;
}

export const DEFAULT_STOPS: StopSettings = {
  dayStartMin: 8 * 60,
  fuelStopMin: 15,
  lunchMin: 45,
  lunchAfterDrivingH: 4,
};

/** С какого километра действует часовой пояс. Первая запись с fromKm = 0. */
export interface ZoneMark {
  fromKm: number;
  timeZone: string;
}

export interface TripInput {
  legs: Leg[];
  split: SplitMode;
  profile: MotoProfile;
  group: Group;
  /** Дата старта ГГГГ-ММ-ДД. */
  startDate: string;
  zones: ZoneMark[];
  /** Цена топлива, ₽ за литр. */
  fuelPriceRub: number;
  stops?: StopSettings;
}

export type DayWarningKind = "overDailyKm" | "overDailyHours" | "heavyDay";

export interface DayWarning {
  kind: DayWarningKind;
  message: string;
}

export interface DayPlan {
  /** Номер дня с 1. */
  number: number;
  date: string;
  startKm: number;
  endKm: number;
  distanceKm: number;
  drivingH: number;
  /** Заправки этого дня, км от старта маршрута. */
  fuelStopsKm: number[];
  stopsH: number;
  totalH: number;
  startTimeZone: string;
  endTimeZone: string;
  departure: Date;
  arrival: Date;
  /** Изменение пояса за день, ч: «+3 ч» на пути на восток. */
  zoneShiftH: number;
  hasToll: boolean;
  hasFerry: boolean;
  liters: number;
  fuelCostRub: number;
  warnings: DayWarning[];
}

export interface TripPlan {
  group: Group;
  rangeKm: number;
  distanceKm: number;
  drivingH: number;
  totalH: number;
  liters: number;
  fuelCostRub: number;
  fuelStops: number;
  nights: number;
  days: DayPlan[];
  hasToll: boolean;
  hasFerry: boolean;
}

export function zoneAtKm(zones: readonly ZoneMark[], km: number): string {
  const first = zones[0];
  if (!first) throw new RangeError("Нужен хотя бы один часовой пояс");
  let zone = first.timeZone;
  for (const mark of zones) {
    if (mark.fromKm <= km) zone = mark.timeZone;
    else break;
  }
  return zone;
}

function round1(value: number): string {
  return value.toLocaleString("ru-RU", { maximumFractionDigits: 1 });
}

function dayWarnings(
  day: Pick<DayPlan, "distanceKm" | "totalH">,
  profile: MotoProfile,
): DayWarning[] {
  const warnings: DayWarning[] = [];
  if (day.distanceKm > profile.dailyLimitKm) {
    warnings.push({
      kind: "overDailyKm",
      message: `${Math.round(day.distanceKm)} км: больше дневного лимита ${profile.dailyLimitKm} км`,
    });
  }
  if (day.totalH > profile.dailyLimitH) {
    warnings.push({
      kind: "overDailyHours",
      message: `${round1(day.totalH)} ч в пути: больше лимита ${profile.dailyLimitH} ч`,
    });
  }
  if (day.distanceKm > profile.heavyDayKm) {
    warnings.push({
      kind: "heavyDay",
      message: `Тяжёлый день: больше ${profile.heavyDayKm} км. Подумайте о дополнительной ночёвке`,
    });
  }
  return warnings;
}

export function planTrip(input: TripInput): TripPlan {
  const stops = input.stops ?? DEFAULT_STOPS;
  const group = normalizeGroup(input.group);
  const segments: Segment[] = input.legs.flatMap((leg) => leg.segments);
  const range = rangeKm(input.profile.tankL, input.profile.consumptionLPer100Km);
  const boundaries = dayBoundariesKm(input.legs, input.split);
  const distanceKm = boundaries[boundaries.length - 1] ?? 0;
  const allFuelStops = fuelStopsKm(distanceKm, range);

  const days: DayPlan[] = [];
  let startKm = 0;
  boundaries.forEach((endKm, index) => {
    const daySegments = sliceSegments(segments, startKm, endKm);
    const drivingH = drivingTimeH(daySegments, input.profile.speeds);
    const dayFuelStops = allFuelStops.filter((km) => km > startKm && km <= endKm);
    const lunch = drivingH >= stops.lunchAfterDrivingH ? stops.lunchMin : 0;
    const stopsH = (dayFuelStops.length * stops.fuelStopMin + lunch) / 60;
    const totalH = drivingH + stopsH;
    const date = addDays(input.startDate, index);
    const startTimeZone = zoneAtKm(input.zones, startKm);
    const endTimeZone = zoneAtKm(input.zones, endKm);
    const departure = zonedTimeToInstant(date, stops.dayStartMin, startTimeZone);
    const arrival = new Date(departure.getTime() + totalH * 3600000);
    const zoneShiftH =
      (utcOffsetMinutes(endTimeZone, arrival) - utcOffsetMinutes(startTimeZone, departure)) / 60;
    const dayDistance = endKm - startKm;
    const liters = fuelLiters(dayDistance, input.profile.consumptionLPer100Km, group.motorcycles);
    const day = {
      number: index + 1,
      date,
      startKm,
      endKm,
      distanceKm: dayDistance,
      drivingH,
      fuelStopsKm: dayFuelStops,
      stopsH,
      totalH,
      startTimeZone,
      endTimeZone,
      departure,
      arrival,
      zoneShiftH,
      hasToll: daySegments.some((s) => s.toll === true),
      hasFerry: daySegments.some((s) => s.ferry === true),
      liters,
      fuelCostRub: fuelCost(liters, input.fuelPriceRub),
    };
    days.push({ ...day, warnings: dayWarnings(day, input.profile) });
    startKm = endKm;
  });

  const sum = (pick: (day: DayPlan) => number): number => days.reduce((s, d) => s + pick(d), 0);
  return {
    group,
    rangeKm: range,
    distanceKm,
    drivingH: sum((d) => d.drivingH),
    totalH: sum((d) => d.totalH),
    liters: sum((d) => d.liters),
    fuelCostRub: sum((d) => d.fuelCostRub),
    fuelStops: allFuelStops.length,
    nights: Math.max(0, days.length - 1),
    days,
    hasToll: days.some((d) => d.hasToll),
    hasFerry: days.some((d) => d.hasFerry),
  };
}
