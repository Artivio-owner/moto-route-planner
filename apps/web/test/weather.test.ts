import { describe, expect, it } from "vitest";
import type { DayWeather } from "../src/lib/api";
import { describeWeather, weatherSource, weatherWarnings } from "../src/lib/weather";

const base: DayWeather = {
  kind: "forecast",
  date: "2026-07-01",
  tempMaxC: 24,
  tempMinC: 13,
  precipitationMm: 0.4,
  precipitationProbability: 10,
  windMaxKmh: 18,
  weatherCode: 2,
};

const limits = { rainMm: 5, rainProbability: 60, windKmh: 50, coldC: 5, hotC: 33 };

describe("погода в путевом листе", () => {
  it("описание по-русски", () => {
    expect(describeWeather(base)).toBe(
      "облачно, +13…+24 °C, осадки 0,4 мм (10%), ветер до 18 км/ч",
    );
    expect(weatherSource(base)).toBe("прогноз");
    expect(weatherSource({ ...base, kind: "climate", years: 10 })).toBe(
      "климатическая норма за 10 лет",
    );
  });

  it("без порогов предупреждений нет", () => {
    expect(weatherWarnings(base, limits)).toEqual([]);
  });

  it("дождь, ветер, холод, жара, гроза", () => {
    const warnings = weatherWarnings(
      {
        ...base,
        precipitationProbability: 80,
        windMaxKmh: 60,
        tempMinC: 2,
        tempMaxC: 35,
        weatherCode: 95,
      },
      limits,
    );
    expect(warnings).toHaveLength(5);
    expect(warnings[0]).toMatch(/дождь/);
  });
});
