// Сводный расчёт поездки по дням: время, заправки, топливо, местное время.
// Спецификации: docs/08-day-split-spec.md, docs/14-trip-parameters-spec.md.

import { countryMarks, countryName, fuelCostByMarks, type PriceMark } from "./countries.js";
import {
  dayBoundariesKm,
  snapBoundariesToPlaces,
  type Leg,
  type PlaceOnRoute,
  type SplitMode,
} from "./days.js";
import { fuelLiters, fuelStopsAtStations, fuelStopsKm, rangeKm, type FuelGap } from "./fuel.js";
import { normalizeGroup, type Group } from "./group.js";
import {
  drivingTimeH,
  segmentDurationH,
  sliceSegments,
  type Segment,
  type Speeds,
} from "./roads.js";
import { sunTimes } from "./sun.js";
import { addDays, formatLocalTime, utcOffsetMinutes, zonedTimeToInstant } from "./time.js";

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
  /** Координаты точки на отметке км: нужны для восхода и заката (C-06). */
  positionAtKm?: (km: number) => { lat: number; lon: number };
  /**
   * Дневки (C-11): номера ходовых дней (с 1), после которых следует день отдыха
   * в точке финиша. Номера за пределами ходовых дней, кроме последнего, игнорируются.
   */
  restAfterDays?: readonly number[];
  /**
   * Цена топлива по участкам (страны, v0.2). Без отметок везде fuelPriceRub.
   * Первая отметка действует с начала маршрута.
   */
  fuelPriceMarks?: readonly PriceMark[];
  /**
   * АЗС вдоль маршрута, км (v0.3, P-07). Если задано, заправки ставятся на реальные АЗС,
   * а участки без АЗС дальше запаса хода дают предупреждение. Без слоя POI: undefined.
   */
  fuelStationsKm?: readonly number[];
  /**
   * Населённые пункты вдоль маршрута (C-10): автоматические границы дней сдвигаются
   * к ближайшему в пределах 10% длины дня. В ручном режиме не используются.
   */
  places?: readonly PlaceOnRoute[];
}

export type DayWarningKind =
  "overDailyKm" | "overDailyHours" | "heavyDay" | "afterSunset" | "border" | "noFuel";

export interface DayWarning {
  kind: DayWarningKind;
  message: string;
}

export interface DayPlan {
  /** Номер дня с 1 (календарный, дневки считаются). */
  number: number;
  /** Дневка: день отдыха, километраж 0 (C-11). */
  rest: boolean;
  /** Номер ходового дня с 1; у дневки номер дня, после которого она идёт. */
  ridingNumber: number;
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
  /** Восход в точке старта и закат в точке финиша дня; null при полярном дне или ночи. */
  sunrise: Date | null;
  sunset: Date | null;
  polar: "day" | "night" | null;
  /** Пересечения границ за день (R-10). */
  borders: BorderCrossing[];
  warnings: DayWarning[];
  /** Населённый пункт ночёвки, к которому привязан финиш дня (C-10); иначе пусто. */
  endPlace: string;
}

export interface BorderCrossing {
  km: number;
  from: string;
  to: string;
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
  /** Число дневок. */
  restDays: number;
  days: DayPlan[];
  hasToll: boolean;
  hasFerry: boolean;
  /** Заправки поставлены на реальные АЗС из OSM (иначе через каждый запас хода). */
  fuelStopsAtStations: boolean;
  /** Участки, где до следующей АЗС дальше запаса хода. */
  fuelGaps: FuelGap[];
  /** Страны по порядку, коды ISO; неопределённые участки пропущены. */
  countries: string[];
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

/** Нарастающее ходовое время по участкам: точки [км, ч] в концах участков. */
function timeProfile(segments: readonly Segment[], speeds: Speeds): { km: number[]; h: number[] } {
  const km = [0];
  const h = [0];
  for (const segment of segments) {
    km.push((km[km.length - 1] ?? 0) + segment.distanceKm);
    h.push((h[h.length - 1] ?? 0) + segmentDurationH(segment, speeds));
  }
  return { km, h };
}

/** Ходовое время от старта до отметки км (линейно внутри участка). */
function hoursAtKm(profile: { km: number[]; h: number[] }, atKm: number): number {
  for (let i = 1; i < profile.km.length; i++) {
    const k1 = profile.km[i] ?? 0;
    if (k1 >= atKm) {
      const k0 = profile.km[i - 1] ?? 0;
      const h0 = profile.h[i - 1] ?? 0;
      const h1 = profile.h[i] ?? 0;
      return k1 === k0 ? h1 : h0 + ((atKm - k0) / (k1 - k0)) * (h1 - h0);
    }
  }
  return profile.h[profile.h.length - 1] ?? 0;
}

/** Отметка км, на которой ходовое время достигает atH. */
function kmAtHours(profile: { km: number[]; h: number[] }, atH: number): number {
  for (let i = 1; i < profile.h.length; i++) {
    const h1 = profile.h[i] ?? 0;
    if (h1 >= atH) {
      const h0 = profile.h[i - 1] ?? 0;
      const k0 = profile.km[i - 1] ?? 0;
      const k1 = profile.km[i] ?? 0;
      return h1 === h0 ? k1 : k0 + ((atH - h0) / (h1 - h0)) * (k1 - k0);
    }
  }
  return profile.km[profile.km.length - 1] ?? 0;
}

/** Время дня с остановками: ходовое, заправки на участке, обед. */
function dayTotalH(
  profile: { km: number[]; h: number[] },
  fuelStops: readonly number[],
  stops: StopSettings,
  fromKm: number,
  toKm: number,
): number {
  const driving = hoursAtKm(profile, toKm) - hoursAtKm(profile, fromKm);
  const fuel = fuelStops.filter((k) => k > fromKm && k <= toKm).length;
  const lunch = driving >= stops.lunchAfterDrivingH ? stops.lunchMin : 0;
  return driving + (fuel * stops.fuelStopMin + lunch) / 60;
}

/** Границы дней по лимиту часов в пути с остановками (C-08). */
function boundariesByHours(
  profile: { km: number[]; h: number[] },
  fuelStops: readonly number[],
  stops: StopSettings,
  maxHours: number,
): number[] {
  if (!Number.isFinite(maxHours) || maxHours <= 0)
    throw new RangeError("Лимит часов в день должен быть больше 0");
  const total = profile.km[profile.km.length - 1] ?? 0;
  const boundaries: number[] = [];
  let start = 0;
  while (total - start > 1e-6) {
    if (dayTotalH(profile, fuelStops, stops, start, total) <= maxHours) break;
    // Бинарный поиск самой дальней точки, до которой день укладывается в лимит.
    let lo = start;
    let hi = total;
    for (let i = 0; i < 50; i++) {
      const mid = (lo + hi) / 2;
      if (dayTotalH(profile, fuelStops, stops, start, mid) <= maxHours) lo = mid;
      else hi = mid;
    }
    // Даже если один участок длиннее лимита (паром), день не может быть пустым.
    const end = lo - start < 1 ? Math.min(total, start + 1) : lo;
    boundaries.push(end);
    start = end;
  }
  boundaries.push(total);
  return boundaries;
}

/** Границы для N дней примерно поровну по ходовому времени (C-09). */
function boundariesByDays(profile: { km: number[]; h: number[] }, days: number): number[] {
  if (!Number.isInteger(days) || days < 1)
    throw new RangeError("Число дней должно быть целым и не меньше 1");
  const totalH = profile.h[profile.h.length - 1] ?? 0;
  const totalKm = profile.km[profile.km.length - 1] ?? 0;
  const boundaries: number[] = [];
  for (let d = 1; d < days; d++) boundaries.push(kmAtHours(profile, (totalH * d) / days));
  boundaries.push(totalKm);
  return boundaries;
}

function sunForDay(
  input: TripInput,
  date: string,
  startKm: number,
  endKm: number,
): Pick<DayPlan, "sunrise" | "sunset" | "polar"> {
  if (!input.positionAtKm) return { sunrise: null, sunset: null, polar: null };
  const start = input.positionAtKm(startKm);
  const end = input.positionAtKm(endKm);
  const atEnd = sunTimes(date, end.lat, end.lon);
  return {
    sunrise: sunTimes(date, start.lat, start.lon).sunrise,
    sunset: atEnd.sunset,
    polar: atEnd.polar,
  };
}

/** День отдыха в точке финиша ходового дня: без километров, топлива и предупреждений. */
function restDay(
  input: TripInput,
  stops: StopSettings,
  after: Pick<DayPlan, "endKm" | "endTimeZone" | "ridingNumber" | "date">,
  number: number,
): DayPlan {
  const date = addDays(after.date, 1);
  const at = zonedTimeToInstant(date, stops.dayStartMin, after.endTimeZone);
  return {
    number,
    rest: true,
    ridingNumber: after.ridingNumber,
    date,
    startKm: after.endKm,
    endKm: after.endKm,
    distanceKm: 0,
    drivingH: 0,
    fuelStopsKm: [],
    stopsH: 0,
    totalH: 0,
    startTimeZone: after.endTimeZone,
    endTimeZone: after.endTimeZone,
    departure: at,
    arrival: at,
    zoneShiftH: 0,
    hasToll: false,
    hasFerry: false,
    liters: 0,
    fuelCostRub: 0,
    borders: [],
    endPlace: "",
    ...sunForDay(input, date, after.endKm, after.endKm),
    warnings: [],
  };
}

export function planTrip(input: TripInput): TripPlan {
  const stops = input.stops ?? DEFAULT_STOPS;
  const group = normalizeGroup(input.group);
  const segments: Segment[] = input.legs.flatMap((leg) => leg.segments);
  const range = rangeKm(input.profile.tankL, input.profile.consumptionLPer100Km);
  const totalKm = segments.reduce((sum, seg) => sum + seg.distanceKm, 0);
  const atStations = input.fuelStationsKm
    ? fuelStopsAtStations(totalKm, range, input.fuelStationsKm)
    : null;
  const allFuelStops = atStations ? atStations.stops : fuelStopsKm(totalKm, range);
  const fuelGaps = atStations?.gaps ?? [];
  const profile = timeProfile(segments, input.profile.speeds);
  const { split } = input;
  const rawBoundaries =
    split.mode === "hours"
      ? boundariesByHours(profile, allFuelStops, stops, split.maxHoursPerDay)
      : split.mode === "days"
        ? boundariesByDays(profile, split.days)
        : dayBoundariesKm(input.legs, split);
  const snapped =
    split.mode !== "manual" && input.places?.length
      ? snapBoundariesToPlaces(rawBoundaries, input.places)
      : { boundaries: rawBoundaries, names: rawBoundaries.map(() => "") };
  const boundaries = snapped.boundaries;
  const distanceKm = boundaries[boundaries.length - 1] ?? 0;

  const crossings: BorderCrossing[] = [];
  const marks = countryMarks(input.zones);
  marks.forEach((mark, i) => {
    const prev = marks[i - 1];
    // Участок с неопределённой страной не даёт предупреждения ни на входе, ни на выходе.
    if (prev?.country && mark.country && prev.country !== mark.country) {
      crossings.push({ km: mark.fromKm, from: prev.country, to: mark.country });
    }
  });
  const priceMarks = input.fuelPriceMarks?.length
    ? input.fuelPriceMarks
    : [{ fromKm: 0, priceRub: input.fuelPriceRub }];
  const rest = new Set(
    (input.restAfterDays ?? []).filter(
      (n) => Number.isInteger(n) && n >= 1 && n < boundaries.length,
    ),
  );
  const days: DayPlan[] = [];
  let startKm = 0;
  boundaries.forEach((endKm, index) => {
    const daySegments = sliceSegments(segments, startKm, endKm);
    const drivingH = drivingTimeH(daySegments, input.profile.speeds);
    const dayFuelStops = allFuelStops.filter((km) => km > startKm && km <= endKm);
    const lunch = drivingH >= stops.lunchAfterDrivingH ? stops.lunchMin : 0;
    const stopsH = (dayFuelStops.length * stops.fuelStopMin + lunch) / 60;
    const totalH = drivingH + stopsH;
    const date = addDays(input.startDate, days.length);
    const startTimeZone = zoneAtKm(input.zones, startKm);
    const endTimeZone = zoneAtKm(input.zones, endKm);
    const departure = zonedTimeToInstant(date, stops.dayStartMin, startTimeZone);
    const arrival = new Date(departure.getTime() + totalH * 3600000);
    const zoneShiftH =
      (utcOffsetMinutes(endTimeZone, arrival) - utcOffsetMinutes(startTimeZone, departure)) / 60;
    const dayDistance = endKm - startKm;
    const liters = fuelLiters(dayDistance, input.profile.consumptionLPer100Km, group.motorcycles);
    const day = {
      number: days.length + 1,
      rest: false,
      ridingNumber: index + 1,
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
      fuelCostRub: fuelCostByMarks(priceMarks, startKm, endKm, liters),
      borders: crossings.filter((c) => c.km > startKm && c.km <= endKm),
    };
    const sun = sunForDay(input, date, startKm, endKm);
    const warnings = dayWarnings(day, input.profile);
    for (const gap of fuelGaps.filter((g) => g.fromKm >= startKm && g.fromKm < endKm)) {
      warnings.push({
        kind: "noFuel",
        message: `Нет АЗС на участке ${Math.round(gap.fromKm)}–${Math.round(gap.toKm)} км: это больше запаса хода (${Math.round(range)} км). Возьмите канистру или заправьтесь заранее`,
      });
    }
    for (const border of day.borders) {
      warnings.push({
        kind: "border",
        message: `Граница: ${countryName(border.from)} → ${countryName(border.to)} (${Math.round(border.km)}-й км). Проверьте документы, страховку и правила въезда`,
      });
    }
    if (sun.sunset && arrival > sun.sunset) {
      warnings.push({
        kind: "afterSunset",
        message: `Финиш после заката (закат в ${formatLocalTime(sun.sunset, endTimeZone)}): сдвиньте старт раньше или ночёвку ближе`,
      });
    }
    if (sun.polar === "night") {
      warnings.push({ kind: "afterSunset", message: "Полярная ночь: весь день в темноте" });
    }
    days.push({ ...day, ...sun, warnings, endPlace: snapped.names[index] ?? "" });
    if (rest.has(index + 1)) days.push(restDay(input, stops, day, days.length + 1));
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
    // Ночей = дни минус 1, дневки уже входят в число дней (спецификация 08).
    nights: Math.max(0, days.length - 1),
    restDays: rest.size,
    days,
    hasToll: days.some((d) => d.hasToll),
    hasFerry: days.some((d) => d.hasFerry),
    fuelStopsAtStations: atStations !== null,
    fuelGaps,
    countries: [...new Set(marks.map((m) => m.country).filter((c): c is string => c !== null))],
  };
}
