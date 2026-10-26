// Погода по дням: задачи C-07 и C-13. Источник: Open-Meteo (бесплатно для некоммерческого
// использования, без ключа, данные CC BY 4.0). Прогноз до 16 дней, дальше климатическая
// норма: средние значения за прошлые годы в окне ±3 дня от даты.

import { LruCache } from "./cache.js";
import { UserFacingError } from "./errors.js";

export const FORECAST_DAYS = 16;
const CLIMATE_YEARS = 10;
const CLIMATE_WINDOW_DAYS = 3;

export interface DayWeather {
  kind: "forecast" | "climate";
  date: string;
  tempMaxC: number;
  tempMinC: number;
  precipitationMm: number;
  /** Только у прогноза. */
  precipitationProbability?: number;
  windMaxKmh: number;
  /** Код погоды WMO, только у прогноза. */
  weatherCode?: number;
  /** Сколько лет усреднено для климатической нормы. */
  years?: number;
}

interface DailyResponse {
  daily?: {
    time: string[];
    temperature_2m_max: (number | null)[];
    temperature_2m_min: (number | null)[];
    precipitation_sum: (number | null)[];
    wind_speed_10m_max: (number | null)[];
    precipitation_probability_max?: (number | null)[];
    weather_code?: (number | null)[];
  };
}

const DAY_MS = 86400000;
const iso = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
const parseDate = (date: string): number => Date.parse(`${date}T00:00:00Z`);

function mean(values: (number | null | undefined)[]): number {
  const nums = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : Number.NaN;
}

export interface WeatherClient {
  day(lat: number, lon: number, date: string, today?: string): Promise<DayWeather>;
}

export function createWeatherClient(
  urls: { forecast: string; archive: string },
  timeoutMs: number,
  fetchImpl: typeof fetch = fetch,
): WeatherClient {
  // Прогноз обновляем раз в 3 часа, норму держим сутки.
  const cache = new LruCache<{ at: number; value: DayWeather }>(2000);

  async function get(url: string): Promise<DailyResponse> {
    let response: Response;
    try {
      response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
    } catch {
      throw new UserFacingError(
        "Сервис погоды недоступен. Попробуйте позже",
        503,
        "weather_unavailable",
      );
    }
    if (!response.ok) throw new UserFacingError("Сервис погоды не ответил", 502, "weather_error");
    return (await response.json()) as DailyResponse;
  }

  async function forecast(lat: number, lon: number, date: string): Promise<DayWeather> {
    const params = new URLSearchParams({
      latitude: lat.toFixed(3),
      longitude: lon.toFixed(3),
      daily:
        "temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,weather_code",
      timezone: "auto",
      start_date: date,
      end_date: date,
    });
    const d = (await get(`${urls.forecast}?${params}`)).daily;
    if (!d?.time.length)
      throw new UserFacingError("Нет прогноза на эту дату", 404, "weather_missing");
    const result: DayWeather = {
      kind: "forecast",
      date,
      tempMaxC: d.temperature_2m_max[0] ?? Number.NaN,
      tempMinC: d.temperature_2m_min[0] ?? Number.NaN,
      precipitationMm: d.precipitation_sum[0] ?? 0,
      windMaxKmh: d.wind_speed_10m_max[0] ?? Number.NaN,
    };
    const probability = d.precipitation_probability_max?.[0];
    const code = d.weather_code?.[0];
    if (typeof probability === "number") result.precipitationProbability = probability;
    if (typeof code === "number") result.weatherCode = code;
    return result;
  }

  async function climate(
    lat: number,
    lon: number,
    date: string,
    today: string,
  ): Promise<DayWeather> {
    // Архив: последние полные годы до сегодняшнего дня.
    const end = parseDate(today) - 7 * DAY_MS;
    const start = end - CLIMATE_YEARS * 365.25 * DAY_MS;
    const params = new URLSearchParams({
      latitude: lat.toFixed(2),
      longitude: lon.toFixed(2),
      daily: "temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max",
      timezone: "auto",
      start_date: iso(start),
      end_date: iso(end),
    });
    const d = (await get(`${urls.archive}?${params}`)).daily;
    if (!d?.time.length)
      throw new UserFacingError("Нет данных для климатической нормы", 404, "weather_missing");
    const monthDay = date.slice(5);
    const target = parseDate(`2001-${monthDay === "02-29" ? "02-28" : monthDay}`);
    const picked: number[] = [];
    const years = new Set<string>();
    d.time.forEach((t, i) => {
      const md = t.slice(5);
      if (md === "02-29") return;
      const diff = Math.abs(parseDate(`2001-${md}`) - target) / DAY_MS;
      if (Math.min(diff, 365 - diff) <= CLIMATE_WINDOW_DAYS) {
        picked.push(i);
        years.add(t.slice(0, 4));
      }
    });
    return {
      kind: "climate",
      date,
      tempMaxC: mean(picked.map((i) => d.temperature_2m_max[i])),
      tempMinC: mean(picked.map((i) => d.temperature_2m_min[i])),
      precipitationMm: mean(picked.map((i) => d.precipitation_sum[i])),
      windMaxKmh: mean(picked.map((i) => d.wind_speed_10m_max[i])),
      years: years.size,
    };
  }

  return {
    async day(lat, lon, date, today = iso(Date.now())) {
      const ahead = (parseDate(date) - parseDate(today)) / DAY_MS;
      const kind = ahead >= 0 && ahead < FORECAST_DAYS ? "forecast" : "climate";
      // Норма меняется медленно: ключ грубее (0,5°) и без года.
      const key =
        kind === "forecast"
          ? `f|${lat.toFixed(2)}|${lon.toFixed(2)}|${date}`
          : `c|${(Math.round(lat * 2) / 2).toFixed(1)}|${(Math.round(lon * 2) / 2).toFixed(1)}|${date.slice(5)}`;
      const ttl = kind === "forecast" ? 3 * 3600000 : 24 * 3600000;
      const cached = cache.get(key);
      if (cached && Date.now() - cached.at < ttl) return { ...cached.value, date };
      const value =
        kind === "forecast" ? await forecast(lat, lon, date) : await climate(lat, lon, date, today);
      cache.set(key, { at: Date.now(), value });
      return value;
    },
  };
}
