import { describe, expect, it } from "vitest";
import { LruCache } from "../src/cache.js";
import { cumulativeKm, haversineKm, simplifyIndices, type LonLat } from "../src/geometry.js";

describe("геометрия", () => {
  it("Москва — Санкт-Петербург по прямой около 634 км", () => {
    expect(haversineKm([37.6173, 55.7558], [30.3141, 59.9386])).toBeCloseTo(634, -1);
  });

  it("упрощение убирает точки на прямой", () => {
    const line: LonLat[] = Array.from({ length: 11 }, (_, i) => [37 + i * 0.01, 55]);
    expect(simplifyIndices(line, 0.015)).toEqual([0, 10]);
    expect(cumulativeKm(line).at(-1)).toBeGreaterThan(6);
  });

  it("упрощение сохраняет изгиб", () => {
    const bend: LonLat[] = [
      [37, 55],
      [37.05, 55.05],
      [37.1, 55],
    ];
    expect(simplifyIndices(bend, 0.015)).toEqual([0, 1, 2]);
  });
});

describe("LruCache", () => {
  it("вытесняет самую старую запись", () => {
    const cache = new LruCache<number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.get("a");
    cache.set("c", 3);
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBe(1);
    expect(cache.size).toBe(2);
  });
});
