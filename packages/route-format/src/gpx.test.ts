import { describe, expect, it } from "vitest";
import { buildGpx, exportFileName } from "./gpx.js";

describe("GPX 1.1", () => {
  const gpx = buildGpx({
    name: "Сочи — Москва & обратно",
    createdAt: "2026-10-26T10:00:00Z",
    waypoints: [
      { name: "Сочи", lat: 43.5855, lon: 39.7231 },
      { name: "Москва", lat: 55.7558, lon: 37.6173 },
    ],
    days: [
      {
        name: "День 1: Сочи — Ростов",
        points: [
          { lat: 43.5855, lon: 39.7231 },
          { lat: 47.2357, lon: 39.7015 },
        ],
      },
      {
        name: "День 2: Ростов — Москва",
        points: [
          { lat: 47.2357, lon: 39.7015 },
          { lat: 55.7558, lon: 37.6173 },
        ],
      },
    ],
  });

  it("корневой элемент и пространство имён GPX 1.1", () => {
    expect(gpx).toContain(
      '<gpx version="1.1" creator="Верста" xmlns="http://www.topografix.com/GPX/1/1"',
    );
  });

  it("точки маршрута, треки по дням и экранирование", () => {
    expect(gpx.match(/<wpt /g)).toHaveLength(2);
    expect(gpx.match(/<trk>/g)).toHaveLength(2);
    expect(gpx).toContain("<name>Сочи — Москва &amp; обратно</name>");
    expect(gpx).toContain('<trkpt lat="47.235700" lon="39.701500"/>');
  });

  it("имя файла без запрещённых символов", () => {
    expect(exportFileName("Ростов-на-Дону", "Нижний Новгород", "2026-07-01", "gpx")).toBe(
      "versta_Ростов-на-Дону-Нижний_Новгород_2026-07-01.gpx",
    );
  });
});
