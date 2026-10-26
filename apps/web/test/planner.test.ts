import { describe, expect, it } from "vitest";
import {
  completePoints,
  fromRouteState,
  initialState,
  reducer,
  routeTitle,
  toRouteState,
  type PlannerState,
} from "../src/state/planner";

function withPoints(): PlannerState {
  let s = initialState(new Date("2026-07-01T10:00:00Z"));
  s = reducer(s, { type: "addFromMap", name: "Сочи", lat: 43.58, lon: 39.72 });
  s = reducer(s, { type: "addFromMap", name: "Москва", lat: 55.75, lon: 37.62 });
  return s;
}

describe("состояние планировщика", () => {
  it("значения по умолчанию из data/", () => {
    const s = initialState(new Date("2026-07-01T10:00:00Z"));
    expect(s.startDate).toBe("2026-07-01");
    expect(s.avoidUnpaved).toBe(true);
    expect(s.profile.presetId).toBe("chopper");
    expect(s.split).toEqual({ mode: "km", maxKmPerDay: 350 });
    expect(s.points).toHaveLength(2);
  });

  it("клики по карте заполняют сначала пустые поля, потом добавляют промежуточную точку", () => {
    let s = withPoints();
    expect(completePoints(s).map((p) => p.name)).toEqual(["Сочи", "Москва"]);
    s = reducer(s, { type: "addFromMap", name: "Воронеж", lat: 51.66, lon: 39.2 });
    expect(completePoints(s).map((p) => p.name)).toEqual(["Сочи", "Воронеж", "Москва"]);
    expect(routeTitle(completePoints(s))).toBe("Сочи — Москва");
  });

  it("ввод текста сбрасывает координаты до выбора подсказки", () => {
    const s = withPoints();
    const id = s.points[0]?.id ?? "";
    const typed = reducer(s, { type: "typeName", id, name: "Сочи-Адлер" });
    expect(completePoints(typed)).toHaveLength(1);
  });

  it("перестановка и удаление точек", () => {
    let s = withPoints();
    s = reducer(s, { type: "movePoint", id: s.points[1]?.id ?? "", delta: -1 });
    expect(completePoints(s).map((p) => p.name)).toEqual(["Москва", "Сочи"]);
    s = reducer(s, { type: "removePoint", id: s.points[0]?.id ?? "" });
    expect(s.points).toHaveLength(2);
    expect(completePoints(s).map((p) => p.name)).toEqual(["Сочи"]);
  });

  it("2 мотоцикла → людей 2; 1 человек → мотоцикл 1", () => {
    let s = reducer(withPoints(), { type: "set", patch: { motorcycles: 2 } });
    expect([s.people, s.motorcycles]).toEqual([2, 2]);
    s = reducer(s, { type: "set", patch: { people: 1 } });
    expect([s.people, s.motorcycles]).toEqual([1, 1]);
  });

  it("правка параметра переводит профиль в «Свой», пресет возвращает значения", () => {
    let s = reducer(withPoints(), { type: "profileField", field: "tankL", value: 22 });
    expect(s.profile.presetId).toBe("custom");
    s = reducer(s, { type: "preset", id: "touring-enduro" });
    expect(s.profile.tankL).toBe(20);
    expect(s.split).toEqual({ mode: "km", maxKmPerDay: 450 });
  });

  it("режим по времени берёт лимит часов из пресета", () => {
    let s = reducer(withPoints(), {
      type: "set",
      patch: { split: { mode: "hours", maxHoursPerDay: 7 } },
    });
    s = reducer(s, { type: "preset", id: "beginner" });
    expect(s.split).toEqual({ mode: "hours", maxHoursPerDay: 6 });
  });

  it("сброс изменённой цены", () => {
    let s = reducer(withPoints(), { type: "set", patch: { fuelPriceRub: 80 } });
    expect(s.fuelPriceRub).toBe(80);
    s = reducer(s, { type: "resetPrice", field: "fuelPriceRub" });
    expect("fuelPriceRub" in s).toBe(false);
  });

  it("в ссылку и обратно", () => {
    let s = withPoints();
    s = reducer(s, { type: "set", patch: { roundTrip: true, currency: "USD", rubPerUsd: 90 } });
    const back = fromRouteState(toRouteState(s));
    expect(toRouteState(back)).toEqual(toRouteState(s));
  });
});
