import { describe, expect, it } from "vitest";
import { computePlan, pointAtKm, routeLine, sliceLine } from "../src/lib/plan";
import { initialState, reducer } from "../src/state/planner";
import { route } from "./fixtures";

function state() {
  let s = initialState(new Date("2026-07-01T10:00:00Z"));
  s = reducer(s, { type: "addFromMap", name: "Москва", lat: 55.7, lon: 37.6 });
  s = reducer(s, { type: "addFromMap", name: "Казань", lat: 55.8, lon: 49.1 });
  s = reducer(s, { type: "addFromMap", name: "Нижний Новгород", lat: 56.3, lon: 44 });
  return s;
}

describe("расчёт плана из ответа API", () => {
  it("по километрам: 400 км в день", () => {
    const s = reducer(state(), { type: "set", patch: { split: { mode: "km", maxKmPerDay: 400 } } });
    const { plan, fuelPriceRub, fuelPriceEdited } = computePlan(s, route);
    expect(plan.days.map((d) => Math.round(d.distanceKm))).toEqual([400, 400, 100]);
    expect(fuelPriceRub).toBe(75);
    expect(fuelPriceEdited).toBe(false);
    expect(plan.days[0]?.hasToll).toBe(true);
    expect(plan.days[2]?.endTimeZone).toBe("Europe/Samara");
  });

  it("вручную: ночёвка в Нижнем Новгороде", () => {
    let s = reducer(state(), { type: "set", patch: { split: { mode: "manual" } } });
    s = reducer(s, { type: "toggleOvernight", id: s.points[1]?.id ?? "" });
    const { plan } = computePlan(s, route);
    expect(plan.days.map((d) => d.distanceKm)).toEqual([500, 400]);
  });

  it("геометрия: точка на отметке и вырезка дня", () => {
    const line = routeLine(route);
    expect(line.points).toHaveLength(4);
    expect(line.km).toEqual([0, 280, 500, 900]);
    expect(pointAtKm(line, 500)).toEqual([44, 56.3]);
    const day = sliceLine(line, 400, 900);
    expect(day[0]?.[0]).toBeGreaterThan(42);
    expect(day.at(-1)).toEqual([49.1, 55.8]);
  });
});
