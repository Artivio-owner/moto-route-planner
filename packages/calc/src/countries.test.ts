import { describe, expect, it } from "vitest";
import { countryMarks, countryOfZone, fuelCostByMarks } from "./countries.js";
import { planTrip, type TripInput } from "./trip.js";

describe("страны по поясам (v0.2)", () => {
  it("пояса стран покрытия", () => {
    expect(countryOfZone("Asia/Novosibirsk")).toBe("RU");
    expect(countryOfZone("Asia/Almaty")).toBe("KZ");
    expect(countryOfZone("Asia/Tbilisi")).toBe("GE");
    expect(countryOfZone("Europe/Istanbul")).toBe("TR");
    expect(countryOfZone("Etc/Unknown")).toBeNull();
  });

  it("соседние пояса одной страны склеиваются", () => {
    expect(
      countryMarks([
        { fromKm: 0, timeZone: "Europe/Moscow" },
        { fromKm: 900, timeZone: "Europe/Samara" },
        { fromKm: 1500, timeZone: "Asia/Oral" },
      ]),
    ).toEqual([
      { fromKm: 0, country: "RU" },
      { fromKm: 1500, country: "KZ" },
    ]);
  });

  it("стоимость по участкам с разной ценой", () => {
    const marks = [
      { fromKm: 0, priceRub: 75 },
      { fromKm: 100, priceRub: 50 },
    ];
    // 200 км, 20 л: 10 л по 75 и 10 л по 50.
    expect(fuelCostByMarks(marks, 0, 200, 20)).toBeCloseTo(1250);
    expect(fuelCostByMarks(marks, 150, 200, 5)).toBeCloseTo(250);
    expect(fuelCostByMarks(marks, 0, 0, 0)).toBe(0);
  });
});

describe("граница в плане поездки (R-10)", () => {
  const input: TripInput = {
    legs: [{ segments: [{ distanceKm: 600, roadClass: "trunk" }] }],
    split: { mode: "km", maxKmPerDay: 300 },
    profile: {
      tankL: 20,
      consumptionLPer100Km: 5,
      speeds: { motorway: 100, trunk: 80, regional: 70, local: 50 },
      dailyLimitKm: 400,
      dailyLimitH: 9,
      heavyDayKm: 500,
    },
    group: { people: 1, motorcycles: 1 },
    startDate: "2026-07-01",
    zones: [
      { fromKm: 0, timeZone: "Europe/Samara" },
      { fromKm: 420, timeZone: "Asia/Oral" },
    ],
    fuelPriceRub: 75,
  };

  it("предупреждение в день пересечения, список стран", () => {
    const plan = planTrip(input);
    expect(plan.countries).toEqual(["RU", "KZ"]);
    expect(plan.days[0]?.borders).toEqual([]);
    expect(plan.days[1]?.borders).toEqual([{ km: 420, from: "RU", to: "KZ" }]);
    expect(plan.days[1]?.warnings.map((w) => w.kind)).toContain("border");
    expect(plan.days[1]?.warnings.find((w) => w.kind === "border")?.message).toMatch(
      /^Граница: Россия → Казахстан \(420-й км\)\. Проверьте документы/,
    );
  });

  it("цена топлива по странам меняет стоимость дня", () => {
    const plan = planTrip({
      ...input,
      fuelPriceMarks: [
        { fromKm: 0, priceRub: 75 },
        { fromKm: 420, priceRub: 50 },
      ],
    });
    // День 2: 300 км × 5 л/100 км = 15 л; 120 км по 75 и 180 км по 50.
    expect(plan.days[1]?.fuelCostRub).toBeCloseTo(6 * 75 + 9 * 50);
    expect(plan.days[0]?.fuelCostRub).toBeCloseTo(15 * 75);
  });

  it("участок с неопределённой страной не даёт предупреждения", () => {
    const plan = planTrip({
      ...input,
      zones: [
        { fromKm: 0, timeZone: "Europe/Moscow" },
        { fromKm: 200, timeZone: "Asia/Dubai" },
        { fromKm: 400, timeZone: "Europe/Moscow" },
      ],
    });
    expect(plan.days.flatMap((d) => d.borders)).toEqual([]);
    expect(plan.countries).toEqual(["RU"]);
  });
});
