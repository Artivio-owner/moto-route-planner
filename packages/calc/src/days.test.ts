import { describe, expect, it } from "vitest";
import { dayBoundariesKm, snapBoundariesToPlaces, type Leg } from "./days.js";

const leg = (km: number, overnight = false): Leg => ({
  segments: [{ distanceKm: km, roadClass: "trunk" }],
  overnight,
});

describe("по километрам", () => {
  it("900 км и лимит 300 км → 3 дня по 300 км", () => {
    expect(dayBoundariesKm([leg(900)], { mode: "km", maxKmPerDay: 300 })).toEqual([300, 600, 900]);
  });

  it("лимит больше длины маршрута → 1 день", () => {
    expect(dayBoundariesKm([leg(250)], { mode: "km", maxKmPerDay: 400 })).toEqual([250]);
  });

  it("остаток идёт последним днём", () => {
    expect(dayBoundariesKm([leg(700)], { mode: "km", maxKmPerDay: 300 })).toEqual([300, 600, 700]);
  });

  it("отклоняет нулевой лимит", () => {
    expect(() => dayBoundariesKm([leg(100)], { mode: "km", maxKmPerDay: 0 })).toThrow(RangeError);
  });
});

describe("вручную, от города до города", () => {
  // Москва — Воронеж — Ростов-на-Дону — Сочи, расстояния условные.
  const legs = [leg(520, true), leg(570, true), leg(560)];

  it("ночёвки в Воронеже и Ростове → 3 дня", () => {
    expect(dayBoundariesKm(legs, { mode: "manual" })).toEqual([520, 1090, 1650]);
  });

  it("удалили ночёвку → дни объединяются", () => {
    const merged = [leg(520, true), leg(570, false), leg(560)];
    expect(dayBoundariesKm(merged, { mode: "manual" })).toEqual([520, 1650]);
  });

  it("флаг ночёвки на последнем отрезке не создаёт пустой день", () => {
    expect(dayBoundariesKm([leg(300, true)], { mode: "manual" })).toEqual([300]);
  });
});

describe("привязка границ дня к населённым пунктам (C-10)", () => {
  const places = [
    { km: 290, name: "Деревня", rank: 1 as const },
    { km: 310, name: "Городок", rank: 2 as const },
    { km: 640, name: "Далеко", rank: 3 as const },
  ];

  it("ближайший пункт в пределах 10% длины дня, при равенстве крупнее", () => {
    expect(snapBoundariesToPlaces([300, 600, 900], places)).toEqual({
      boundaries: [310, 600, 900],
      names: ["Городок", "", ""],
    });
  });

  it("финиш маршрута не сдвигается, слишком далёкий пункт не берётся", () => {
    expect(snapBoundariesToPlaces([300], places).boundaries).toEqual([300]);
    expect(snapBoundariesToPlaces([500, 900], places).names).toEqual(["", ""]);
  });
});
