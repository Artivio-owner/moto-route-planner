import { describe, expect, it } from "vitest";
import { planTrip, type MotoProfile, type TripInput } from "./trip.js";
import { formatLocalTime } from "./time.js";

const profile: MotoProfile = {
  tankL: 14,
  consumptionLPer100Km: 6,
  speeds: { motorway: 100, trunk: 80, regional: 70, local: 50 },
  dailyLimitKm: 350,
  dailyLimitH: 7,
  heavyDayKm: 450,
};

const base: TripInput = {
  legs: [{ segments: [{ distanceKm: 1000, roadClass: "trunk" }] }],
  split: { mode: "km", maxKmPerDay: 400 },
  profile,
  group: { people: 1, motorcycles: 1 },
  startDate: "2026-07-01",
  zones: [{ fromKm: 0, timeZone: "Europe/Moscow" }],
  fuelPriceRub: 75,
};

describe("planTrip", () => {
  it("2 мотоцикла, 6 л/100 км, 1000 км → 120 л и стоимость 120 л", () => {
    const plan = planTrip({ ...base, group: { people: 2, motorcycles: 2 } });
    expect(plan.liters).toBeCloseTo(120);
    expect(plan.fuelCostRub).toBeCloseTo(9000);
  });

  it("1 человек и 2 мотоцикла → людей 2", () => {
    expect(planTrip({ ...base, group: { people: 1, motorcycles: 2 } }).group.people).toBe(2);
  });

  it("дни, даты, ночи и заправки", () => {
    const plan = planTrip(base);
    expect(plan.days.map((d) => Math.round(d.distanceKm))).toEqual([400, 400, 200]);
    expect(plan.days.map((d) => d.date)).toEqual(["2026-07-01", "2026-07-02", "2026-07-03"]);
    expect(plan.nights).toBe(2);
    // Запас хода 14 / 6 × 100 × 0,9 = 210 км: заправки на 210, 420, 630, 840 км.
    expect(plan.fuelStops).toBe(4);
    expect(plan.days.map((d) => d.fuelStopsKm.length)).toEqual([1, 2, 1]);
  });

  it("время дня: ходовое, заправки и обед", () => {
    const [day] = planTrip(base).days;
    // 400 км / 80 км/ч = 5 ч, одна заправка 15 мин, обед 45 мин.
    expect(day?.drivingH).toBeCloseTo(5);
    expect(day?.totalH).toBeCloseTo(6);
  });

  it("предупреждения о лимитах", () => {
    const [day] = planTrip(base).days;
    expect(day?.warnings.map((w) => w.kind)).toEqual(["overDailyKm"]);
    const heavy = planTrip({ ...base, split: { mode: "km", maxKmPerDay: 500 } }).days[0];
    expect(heavy?.warnings.map((w) => w.kind)).toEqual([
      "overDailyKm",
      "overDailyHours",
      "heavyDay",
    ]);
  });

  it("местное время прибытия в другом поясе (спецификация 14, раздел 5)", () => {
    const plan = planTrip({
      ...base,
      split: { mode: "manual" },
      legs: [{ segments: [{ distanceKm: 400, roadClass: "trunk" }] }],
      zones: [
        { fromKm: 0, timeZone: "Europe/Moscow" },
        { fromKm: 300, timeZone: "Europe/Samara" },
      ],
    });
    const day = plan.days[0];
    if (!day) throw new Error("нет дня");
    expect(day.startTimeZone).toBe("Europe/Moscow");
    expect(day.endTimeZone).toBe("Europe/Samara");
    expect(day.zoneShiftH).toBe(1);
    // Старт 8:00 по Москве, 6 ч в пути: 14:00 по Москве, 15:00 по Самаре.
    expect(formatLocalTime(day.arrival, day.endTimeZone)).toBe("15:00");
  });

  it("помечает паромы и платные участки по дням", () => {
    const plan = planTrip({
      ...base,
      legs: [
        {
          segments: [
            { distanceKm: 300, roadClass: "motorway", toll: true },
            { distanceKm: 300, roadClass: "trunk" },
            { distanceKm: 20, roadClass: "local", ferry: true, fixedDurationH: 1 },
          ],
        },
      ],
    });
    expect(plan.days.map((d) => [d.hasToll, d.hasFerry])).toEqual([
      [true, false],
      [false, true],
    ]);
    expect(plan.hasToll && plan.hasFerry).toBe(true);
  });

  it("маршрут в один день без ночёвок", () => {
    const plan = planTrip({
      ...base,
      legs: [{ segments: [{ distanceKm: 150, roadClass: "local" }] }],
    });
    expect(plan.days).toHaveLength(1);
    expect(plan.nights).toBe(0);
  });

  it("предупреждение о финише после заката (C-11)", () => {
    // Москва, декабрь: закат около 16:00, 8 часов в пути от 8:00.
    const plan = planTrip({
      ...base,
      startDate: "2026-12-20",
      split: { mode: "manual" },
      legs: [{ segments: [{ distanceKm: 560, roadClass: "trunk" }] }],
      positionAtKm: () => ({ lat: 55.75, lon: 37.62 }),
    });
    const day = plan.days[0];
    expect(day?.sunset).not.toBeNull();
    expect(day?.warnings.map((w) => w.kind)).toContain("afterSunset");
    expect(day?.warnings.find((w) => w.kind === "afterSunset")?.message).toMatch(
      /закат в 15:5\d|закат в 16:0\d/,
    );
  });

  it("без координат закат не считается", () => {
    expect(planTrip(base).days[0]?.sunset).toBeNull();
  });

  it("по времени: ни один день не длиннее 8 часов с остановками (C-08)", () => {
    const plan = planTrip({
      ...base,
      split: { mode: "hours", maxHoursPerDay: 8 },
      legs: [{ segments: [{ distanceKm: 2000, roadClass: "trunk" }] }],
    });
    expect(plan.days.length).toBeGreaterThan(1);
    for (const day of plan.days) expect(day.totalH).toBeLessThanOrEqual(8 + 1e-6);
    expect(plan.days.reduce((s, d) => s + d.distanceKm, 0)).toBeCloseTo(2000);
  });

  it("по числу дней: 4 дня примерно равны по времени (C-09)", () => {
    const plan = planTrip({
      ...base,
      split: { mode: "days", days: 4 },
      legs: [
        {
          segments: [
            { distanceKm: 600, roadClass: "motorway" },
            { distanceKm: 300, roadClass: "local" },
            { distanceKm: 500, roadClass: "trunk" },
          ],
        },
      ],
    });
    expect(plan.days).toHaveLength(4);
    const times = plan.days.map((d) => d.drivingH);
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    for (const t of times) expect(Math.abs(t - avg) / avg).toBeLessThanOrEqual(0.15);
  });

  it("лимит часов больше маршрута: один день", () => {
    const plan = planTrip({ ...base, split: { mode: "hours", maxHoursPerDay: 20 } });
    expect(plan.days).toHaveLength(1);
  });

  it("неверные значения режимов отклоняются", () => {
    expect(() => planTrip({ ...base, split: { mode: "days", days: 0 } })).toThrow(RangeError);
    expect(() => planTrip({ ...base, split: { mode: "hours", maxHoursPerDay: 0 } })).toThrow(
      RangeError,
    );
  });
});
