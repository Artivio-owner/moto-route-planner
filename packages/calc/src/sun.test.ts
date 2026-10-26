import { describe, expect, it } from "vitest";
import { sunTimes } from "./sun.js";
import { formatLocalTime } from "./time.js";

const local = (d: Date | null, zone: string): string => (d ? formatLocalTime(d, zone) : "—");
const minutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};
// Сверяем с опубликованными таблицами восхода и заката с допуском 4 минуты.
const near = (actual: string, expected: string) =>
  expect(Math.abs(minutes(actual) - minutes(expected))).toBeLessThanOrEqual(4);

describe("восход и закат", () => {
  it("Москва, летнее солнцестояние: около 3:44 и 21:18", () => {
    const t = sunTimes("2026-06-21", 55.7558, 37.6173);
    near(local(t.sunrise, "Europe/Moscow"), "03:44");
    near(local(t.sunset, "Europe/Moscow"), "21:18");
  });

  it("Москва, зимнее солнцестояние: около 8:59 и 15:58", () => {
    const t = sunTimes("2026-12-22", 55.7558, 37.6173);
    near(local(t.sunrise, "Europe/Moscow"), "08:59");
    near(local(t.sunset, "Europe/Moscow"), "15:58");
  });

  it("Сочи, равноденствие: день около 12 часов", () => {
    const t = sunTimes("2026-03-20", 43.5855, 39.7231);
    const lengthH = ((t.sunset?.getTime() ?? 0) - (t.sunrise?.getTime() ?? 0)) / 3600000;
    expect(lengthH).toBeGreaterThan(12);
    expect(lengthH).toBeLessThan(12.3);
  });

  it("Мурманск: полярная ночь и полярный день", () => {
    expect(sunTimes("2026-12-22", 68.97, 33.07).polar).toBe("night");
    expect(sunTimes("2026-06-21", 68.97, 33.07).polar).toBe("day");
  });

  it("Владивосток: закат по местному времени того же дня", () => {
    const t = sunTimes("2026-07-01", 43.1155, 131.8855);
    expect(t.sunset?.toISOString().slice(0, 10)).toBe("2026-07-01");
    expect(minutes(local(t.sunset, "Asia/Vladivostok"))).toBeGreaterThan(minutes("20:00"));
  });
});
