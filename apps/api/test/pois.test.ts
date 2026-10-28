import { describe, expect, it } from "vitest";
import { cumulativeKm, type LonLat } from "../src/geometry.js";
import { PoiIndex, dedupePois, parsePois } from "../src/pois.js";

// Две строки как от `osmium export -f geojsonseq`: с разделителем RS и без него.
const seq = [
  '\u001e{"type":"Feature","geometry":{"type":"Point","coordinates":[37.5,55.005]},"properties":{"amenity":"fuel","brand":"Лукойл"}}',
  '{"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[37.6,55.03],[37.61,55.03],[37.61,55.04],[37.6,55.04],[37.6,55.03]]]},"properties":{"tourism":"hotel","name":"Hotel","name:ru":"Гостиница «Дорога»"}}',
  '{"type":"Feature","geometry":{"type":"Point","coordinates":[37.7,55.3]},"properties":{"tourism":"camp_site","name":"Далеко"}}',
  '{"type":"Feature","geometry":{"type":"Point","coordinates":[37.8,55.0]},"properties":{"amenity":"cafe","name":"Не наш тип"}}',
  "не json",
].join("\n");

describe("АЗС и жильё вдоль маршрута (P-07)", () => {
  const pois = parsePois(seq);

  it("разбор: типы, названия (русское первым, иначе бренд), центр полигона", () => {
    expect(pois.map((p) => [p.kind, p.name])).toEqual([
      ["fuel", "Лукойл"],
      ["hotel", "Гостиница «Дорога»"],
      ["camp_site", "Далеко"],
    ]);
    expect(pois[1]?.lat).toBeCloseTo(55.034, 2);
  });

  it("вдоль линии: АЗС в 1 км, жильё в 5 км, дальние не попадают", () => {
    const line: LonLat[] = Array.from({ length: 41 }, (_, i) => [37 + i * 0.025, 55]);
    const found = new PoiIndex(pois).alongRoute(line, cumulativeKm(line), 100);
    expect(found.map((p) => p.name)).toEqual(["Лукойл", "Гостиница «Дорога»"]);
    // 37,5° на 55° с. ш. — около 32 км от старта отрезка, плюс сдвиг 100 км.
    expect(found[0]?.km).toBeGreaterThan(130);
    expect(found[0]?.km).toBeLessThan(134);
    expect(found[0]?.offKm).toBeLessThan(1);
  });

  it("повтор у стыка отрезков убирается", () => {
    const a = { kind: "fuel" as const, name: "А", lat: 55, lon: 37, km: 10, offKm: 0.5 };
    expect(dedupePois([a, { ...a, km: 11, offKm: 0.2 }])).toEqual([{ ...a, km: 11, offKm: 0.2 }]);
  });
});
