import { describe, expect, it } from "vitest";
import { createWeatherClient } from "../src/weather.js";

function fakeFetch(handler: (url: URL) => unknown) {
  const calls: URL[] = [];
  const impl = (async (input: string) => {
    const url = new URL(input);
    calls.push(url);
    return new Response(JSON.stringify(handler(url)), { status: 200 });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const urls = {
  forecast: "https://forecast.test/v1/forecast",
  archive: "https://archive.test/v1/archive",
};

describe("погода", () => {
  it("до 16 дней: прогноз на дату", async () => {
    const { impl, calls } = fakeFetch(() => ({
      daily: {
        time: ["2026-07-05"],
        temperature_2m_max: [24],
        temperature_2m_min: [13],
        precipitation_sum: [2.5],
        precipitation_probability_max: [40],
        wind_speed_10m_max: [18],
        weather_code: [61],
      },
    }));
    const client = createWeatherClient(urls, 1000, impl);
    const w = await client.day(55.75, 37.62, "2026-07-05", "2026-07-01");
    expect(w).toMatchObject({
      kind: "forecast",
      tempMaxC: 24,
      precipitationProbability: 40,
      weatherCode: 61,
    });
    expect(calls[0]?.hostname).toBe("forecast.test");
    expect(calls[0]?.searchParams.get("start_date")).toBe("2026-07-05");
  });

  it("дальше 16 дней: климатическая норма по окну ±3 дня за прошлые годы", async () => {
    const time: string[] = [];
    const tmax: number[] = [];
    for (let year = 2017; year <= 2026; year++) {
      for (const day of ["07-27", "07-30", "08-01", "08-02", "08-03", "08-04", "08-10"]) {
        time.push(`${year}-${day}`);
        tmax.push(day === "08-10" || day === "07-27" ? 100 : 20 + (year - 2017));
      }
    }
    const { impl, calls } = fakeFetch(() => ({
      daily: {
        time,
        temperature_2m_max: tmax,
        temperature_2m_min: tmax.map((t) => t - 10),
        precipitation_sum: tmax.map(() => 1),
        wind_speed_10m_max: tmax.map(() => 15),
      },
    }));
    const client = createWeatherClient(urls, 1000, impl);
    const w = await client.day(55.75, 37.62, "2027-08-01", "2026-10-26");
    expect(w.kind).toBe("climate");
    expect(w.tempMaxC).toBeCloseTo(24.5);
    expect(w.years).toBe(10);
    expect(calls[0]?.hostname).toBe("archive.test");
  });

  it("повторный запрос берётся из кэша", async () => {
    const { impl, calls } = fakeFetch(() => ({
      daily: {
        time: ["2026-07-05"],
        temperature_2m_max: [24],
        temperature_2m_min: [13],
        precipitation_sum: [0],
        wind_speed_10m_max: [10],
      },
    }));
    const client = createWeatherClient(urls, 1000, impl);
    await client.day(55.75, 37.62, "2026-07-05", "2026-07-01");
    await client.day(55.75, 37.62, "2026-07-05", "2026-07-01");
    expect(calls).toHaveLength(1);
  });

  it("сервис недоступен: понятная ошибка", async () => {
    const impl = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const client = createWeatherClient(urls, 1000, impl);
    await expect(client.day(55, 37, "2026-07-05", "2026-07-01")).rejects.toMatchObject({
      code: "weather_unavailable",
    });
  });
});
