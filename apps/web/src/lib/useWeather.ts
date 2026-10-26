import { useEffect, useState } from "react";
import { fetchWeather, type DayWeather } from "./api";

export interface WeatherRequest {
  lat: number;
  lon: number;
  date: string;
}

const key = (r: WeatherRequest): string => `${r.lat.toFixed(2)},${r.lon.toFixed(2)},${r.date}`;

/** Погода по дням: по 3 запроса одновременно, уже полученное не запрашивается снова. */
export function useWeather(requests: WeatherRequest[]): (DayWeather | null)[] {
  const [cache, setCache] = useState<Record<string, DayWeather | null>>({});
  const signature = requests.map(key).join("|");

  useEffect(() => {
    const missing = requests.filter((r) => !(key(r) in cache));
    if (!missing.length) return;
    let cancelled = false;
    void (async () => {
      const queue = [...missing];
      const found: Record<string, DayWeather | null> = {};
      await Promise.all(
        Array.from({ length: Math.min(3, queue.length) }, async () => {
          for (let r = queue.shift(); r; r = queue.shift()) {
            try {
              found[key(r)] = await fetchWeather(r.lat, r.lon, r.date);
            } catch {
              // Погода необязательна: без неё путевой лист остаётся полным.
              found[key(r)] = null;
            }
          }
        }),
      );
      if (!cancelled) setCache((prev) => ({ ...prev, ...found }));
    })();
    return () => {
      cancelled = true;
    };
  }, [signature]);

  return requests.map((r) => cache[key(r)] ?? null);
}
