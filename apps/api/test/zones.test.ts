import { describe, expect, it } from "vitest";
import { cumulativeKm, type LonLat } from "../src/geometry.js";
import { zoneMarks } from "../src/zones.js";

describe("часовые пояса вдоль маршрута", () => {
  it("Москва → Самара: смена пояса между ними", () => {
    // Прямая линия от Москвы до Самары с шагом около 2 км (условная геометрия).
    const points: LonLat[] = [];
    for (let i = 0; i <= 500; i++)
      points.push([37.62 + (50.1 - 37.62) * (i / 500), 55.75 + (53.2 - 55.75) * (i / 500)]);
    const marks = zoneMarks(points, cumulativeKm(points), 100);
    expect(marks[0]).toEqual({ fromKm: 100, timeZone: "Europe/Moscow" });
    expect(marks.at(-1)?.timeZone).toBe("Europe/Samara");
    expect(marks.at(-1)?.fromKm).toBeGreaterThan(100);
  });

  it("Владивосток: один пояс", () => {
    const points: LonLat[] = [
      [131.88, 43.11],
      [131.95, 43.8],
    ];
    expect(zoneMarks(points, cumulativeKm(points))).toEqual([
      { fromKm: 0, timeZone: "Asia/Vladivostok" },
    ]);
  });
});
