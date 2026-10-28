import { describe, expect, it } from "vitest";
import { fuelCost, fuelLiters, fuelStopsAtStations, fuelStopsKm, rangeKm } from "./fuel.js";

describe("rangeKm", () => {
  // Значения пресетов из docs/14-trip-parameters-spec.md, раздел 2.
  it.each([
    ["новичок", 14, 4.5, 280],
    ["чопперист", 14, 6.0, 210],
    ["турэндуро", 20, 5.5, 327],
  ])("пресет «%s»: бак %s л, расход %s → ≈ %s км", (_name, tank, consumption, expected) => {
    expect(Math.round(rangeKm(tank, consumption))).toBe(expected);
  });

  it("отклоняет нулевой расход", () => {
    expect(() => rangeKm(14, 0)).toThrow(RangeError);
  });
});

describe("fuelLiters", () => {
  it("2 мотоцикла, 6 л/100 км, 1000 км → 120 л (критерий приёмки C-16)", () => {
    expect(fuelLiters(1000, 6, 2)).toBe(120);
  });

  it("нулевое расстояние → 0 л", () => {
    expect(fuelLiters(0, 6, 1)).toBe(0);
  });

  it("отклоняет отрицательное расстояние", () => {
    expect(() => fuelLiters(-1, 6, 1)).toThrow(RangeError);
  });
});

describe("fuelCost", () => {
  it("120 л по 75 ₽ → 9000 ₽", () => {
    expect(fuelCost(120, 75)).toBe(9000);
  });
});

describe("fuelStopsKm", () => {
  it("заправки через каждый запас хода", () => {
    expect(fuelStopsKm(700, 280)).toEqual([280, 560]);
  });

  it("на маршруте короче запаса хода заправок нет", () => {
    expect(fuelStopsKm(200, 280)).toEqual([]);
  });
});

describe("заправки на реальных АЗС (P-07)", () => {
  it("самая дальняя АЗС в пределах запаса хода", () => {
    // Запас 200 км, АЗС на 150, 190, 260, 380 км, маршрут 500 км.
    expect(fuelStopsAtStations(500, 200, [150, 190, 260, 380])).toEqual({
      stops: [190, 380],
      gaps: [],
    });
  });

  it("участок без АЗС дальше запаса: условная заправка и пометка", () => {
    expect(fuelStopsAtStations(600, 200, [100, 450])).toEqual({
      stops: [100, 300, 450],
      gaps: [{ fromKm: 100, toKm: 450 }],
    });
  });

  it("короткий маршрут без заправок; станции вне маршрута игнорируются", () => {
    expect(fuelStopsAtStations(150, 200, [-5, 50, 900])).toEqual({ stops: [], gaps: [] });
  });
});
