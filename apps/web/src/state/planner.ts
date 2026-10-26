// Состояние планировщика и действия над ним.
import type { ProfileState, RoutePoint, RouteState } from "@versta/route-format";
import { defaultFuel, presets, presetToProfile, tripDefaults, type FuelType } from "../config";

export interface EditablePoint {
  id: string;
  name: string;
  lat?: number;
  lon?: number;
  overnight?: boolean;
}

export interface PlannerState {
  points: EditablePoint[];
  roundTrip: boolean;
  avoidUnpaved: boolean;
  startDate: string;
  people: 1 | 2;
  motorcycles: 1 | 2;
  profile: ProfileState;
  split: RouteState["split"];
  currency: "RUB" | "USD";
  fuelType: FuelType;
  fuelPriceRub?: number;
  rubPerUsd?: number;
}

export const CUSTOM_PRESET = "custom";

let idCounter = 0;
export const newId = (): string => `p${Date.now().toString(36)}${(idCounter++).toString(36)}`;

export function todayIso(now = new Date()): string {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export function initialState(now = new Date()): PlannerState {
  const preset = presets.find((p) => p.id === tripDefaults.presetId) ?? presets[0];
  if (!preset) throw new Error("Нет пресетов в data/moto-presets.json");
  return {
    points: [
      { id: newId(), name: "" },
      { id: newId(), name: "" },
    ],
    roundTrip: false,
    avoidUnpaved: tripDefaults.avoidUnpaved,
    startDate: todayIso(now),
    people: tripDefaults.people,
    motorcycles: tripDefaults.motorcycles,
    profile: presetToProfile(preset),
    // Дневная норма берётся из пресета: иначе каждый день сразу превышал бы его лимит.
    split:
      tripDefaults.split.mode === "manual"
        ? { mode: "manual" }
        : { mode: "km", maxKmPerDay: preset.dailyLimitKm },
    currency: tripDefaults.currency,
    fuelType: defaultFuel,
  };
}

export function isComplete(
  point: EditablePoint,
): point is EditablePoint & { lat: number; lon: number } {
  return point.lat !== undefined && point.lon !== undefined;
}

export function completePoints(state: PlannerState): RoutePoint[] {
  return state.points.filter(isComplete).map((p) => {
    const point: RoutePoint = { name: p.name, lat: p.lat, lon: p.lon };
    if (p.overnight) point.overnight = true;
    return point;
  });
}

export function toRouteState(state: PlannerState): RouteState {
  const route: RouteState = {
    points: completePoints(state),
    roundTrip: state.roundTrip,
    avoidUnpaved: state.avoidUnpaved,
    startDate: state.startDate,
    people: state.people,
    motorcycles: state.motorcycles,
    profile: state.profile,
    split: state.split,
    currency: state.currency,
    fuelType: state.fuelType,
  };
  if (state.fuelPriceRub !== undefined) route.fuelPriceRub = state.fuelPriceRub;
  if (state.rubPerUsd !== undefined) route.rubPerUsd = state.rubPerUsd;
  return route;
}

export function fromRouteState(route: RouteState): PlannerState {
  const points: EditablePoint[] = route.points.map((p) => {
    const point: EditablePoint = { id: newId(), name: p.name, lat: p.lat, lon: p.lon };
    if (p.overnight) point.overnight = true;
    return point;
  });
  while (points.length < 2) points.push({ id: newId(), name: "" });
  const state: PlannerState = { ...route, points };
  return state;
}

export type ProfileField =
  "tankL" | "consumptionLPer100Km" | "dailyLimitKm" | "dailyLimitH" | "heavyDayKm";
export type SpeedField = keyof ProfileState["speeds"];

export type Action =
  | { type: "load"; state: PlannerState }
  | { type: "typeName"; id: string; name: string }
  | { type: "placePoint"; id: string; name: string; lat: number; lon: number }
  | { type: "addFromMap"; name: string; lat: number; lon: number }
  | { type: "addPoint" }
  | { type: "removePoint"; id: string }
  | { type: "movePoint"; id: string; delta: -1 | 1 }
  | { type: "toggleOvernight"; id: string }
  | { type: "set"; patch: Partial<Omit<PlannerState, "points" | "profile">> }
  | { type: "resetPrice"; field: "fuelPriceRub" | "rubPerUsd" }
  | { type: "preset"; id: string }
  | { type: "profileField"; field: ProfileField; value: number }
  | { type: "speed"; field: SpeedField; value: number };

function withoutKey<T extends object, K extends keyof T>(obj: T, key: K): T {
  return Object.fromEntries(Object.entries(obj).filter(([k]) => k !== key)) as T;
}

export function reducer(state: PlannerState, action: Action): PlannerState {
  switch (action.type) {
    case "load":
      return action.state;
    case "typeName":
      // Текст изменили вручную: координаты сбрасываются, пока не выбран вариант из подсказок.
      return {
        ...state,
        points: state.points.map((p) =>
          p.id === action.id
            ? withoutKey(withoutKey({ ...p, name: action.name }, "lat"), "lon")
            : p,
        ),
      };
    case "placePoint":
      return {
        ...state,
        points: state.points.map((p) =>
          p.id === action.id ? { ...p, name: action.name, lat: action.lat, lon: action.lon } : p,
        ),
      };
    case "addFromMap": {
      const point = { id: newId(), name: action.name, lat: action.lat, lon: action.lon };
      const emptyIndex = state.points.findIndex((p) => !isComplete(p) && p.name.trim() === "");
      if (emptyIndex !== -1) {
        const points = [...state.points];
        points[emptyIndex] = { ...point, id: (points[emptyIndex] as EditablePoint).id };
        return { ...state, points };
      }
      // Все поля заполнены: новая точка становится промежуточной перед финишем.
      const points = [...state.points];
      points.splice(points.length - 1, 0, point);
      return { ...state, points };
    }
    case "addPoint": {
      const points = [...state.points];
      points.splice(points.length - 1, 0, { id: newId(), name: "" });
      return { ...state, points };
    }
    case "removePoint": {
      if (state.points.length <= 2) {
        return {
          ...state,
          points: state.points.map((p) => (p.id === action.id ? { id: p.id, name: "" } : p)),
        };
      }
      return { ...state, points: state.points.filter((p) => p.id !== action.id) };
    }
    case "movePoint": {
      const index = state.points.findIndex((p) => p.id === action.id);
      const target = index + action.delta;
      if (index === -1 || target < 0 || target >= state.points.length) return state;
      const points = [...state.points];
      [points[index], points[target]] = [
        points[target] as EditablePoint,
        points[index] as EditablePoint,
      ];
      return { ...state, points };
    }
    case "toggleOvernight":
      return {
        ...state,
        points: state.points.map((p) =>
          p.id === action.id ? { ...p, overnight: !p.overnight } : p,
        ),
      };
    case "set": {
      const next = { ...state, ...action.patch };
      // При двух мотоциклах людей не меньше двух (спецификация 14, раздел 1).
      // Выбрали одного человека: мотоцикл один; выбрали два мотоцикла: людей двое.
      if (action.patch.people === 1) next.motorcycles = 1;
      if (next.motorcycles === 2 && next.people < 2) next.people = 2;
      return next;
    }
    case "resetPrice":
      return withoutKey(state, action.field);
    case "preset": {
      const preset = presets.find((p) => p.id === action.id);
      if (!preset) return { ...state, profile: { ...state.profile, presetId: CUSTOM_PRESET } };
      const split =
        state.split.mode === "km"
          ? { mode: "km" as const, maxKmPerDay: preset.dailyLimitKm }
          : state.split;
      return {
        ...state,
        profile: presetToProfile(preset),
        split,
        avoidUnpaved: state.avoidUnpaved || !preset.allowUnpaved,
      };
    }
    case "profileField":
      return {
        ...state,
        profile: { ...state.profile, [action.field]: action.value, presetId: CUSTOM_PRESET },
      };
    case "speed":
      return {
        ...state,
        profile: {
          ...state.profile,
          speeds: { ...state.profile.speeds, [action.field]: action.value },
          presetId: CUSTOM_PRESET,
        },
      };
  }
}

/** Название маршрута «Откуда — Куда». */
export function routeTitle(points: readonly { name: string }[]): string {
  const named = points.filter((p) => p.name.trim());
  if (named.length < 2) return "Новый маршрут";
  return `${named[0]?.name} — ${named[named.length - 1]?.name}`;
}
