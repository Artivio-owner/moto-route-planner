import { describe, expect, it } from "vitest";
import {
  GPX_IMPORT_MAX_POINTS,
  GPX_TRACK_SAMPLE,
  buildGpx,
  exportFileName,
  parseGpx,
} from "./gpx.js";

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

describe("импорт GPX (X-05)", () => {
  it("наш экспорт открывается обратно: точки маршрута с названиями", () => {
    const gpx = buildGpx({
      name: "Сочи — Москва",
      createdAt: "2026-10-26T10:00:00Z",
      waypoints: [
        { name: "Сочи & Адлер", lat: 43.5855, lon: 39.7231 },
        { name: "Ростов", lat: 47.2357, lon: 39.7015 },
        { name: "Москва", lat: 55.7558, lon: 37.6173 },
      ],
      days: [
        {
          name: "День 1",
          points: [
            { lat: 43.5, lon: 39.7 },
            { lat: 55.7, lon: 37.6 },
          ],
        },
      ],
    });
    const parsed = parseGpx(gpx);
    expect(parsed.source).toBe("waypoints");
    expect(parsed.name).toBe("Сочи — Москва");
    expect(parsed.points.map((p) => p.name)).toEqual(["Сочи & Адлер", "Ростов", "Москва"]);
    expect(parsed.points[0]?.lat).toBeCloseTo(43.5855, 5);
  });

  it("маршрут rtept в приоритете, атрибуты в любом порядке и кавычках", () => {
    const xml = `<?xml version="1.0"?><gpx version="1.1" creator="x">
      <wpt lat="1" lon="1"><name>АЗС</name></wpt>
      <rte><rtept lon='37.6' lat='55.7'><name><![CDATA[Москва]]></name></rtept>
      <rtept lat="59.9" lon="30.3"/></rte></gpx>`;
    const parsed = parseGpx(xml);
    expect(parsed.source).toBe("route");
    expect(parsed.points).toEqual([
      { lat: 55.7, lon: 37.6, name: "Москва" },
      { lat: 59.9, lon: 30.3 },
    ]);
  });

  it("трек прореживается до 10 точек, старт и финиш сохраняются", () => {
    const pts = Array.from({ length: 500 }, (_, i) => `<trkpt lat="${50 + i / 100}" lon="40"/>`);
    const xml = `<gpx creator="Garmin"><wpt lat="1" lon="1"/><wpt lat="2" lon="2"/><trk><trkseg>${pts.join("")}</trkseg></trk></gpx>`;
    const parsed = parseGpx(xml);
    expect(parsed.source).toBe("track");
    expect(parsed.points).toHaveLength(GPX_TRACK_SAMPLE);
    expect(parsed.points[0]?.lat).toBe(50);
    expect(parsed.points.at(-1)?.lat).toBeCloseTo(54.99);
    expect(parsed.truncated).toBe(false);
  });

  it("больше 25 точек маршрута: прореживание с пометкой", () => {
    const pts = Array.from({ length: 60 }, (_, i) => `<rtept lat="${i / 10}" lon="0"/>`);
    const parsed = parseGpx(`<gpx>${pts.join("")}</gpx>`);
    expect(parsed.points).toHaveLength(GPX_IMPORT_MAX_POINTS);
    expect(parsed.truncated).toBe(true);
  });

  it("понятные ошибки", () => {
    expect(() => parseGpx("hello")).toThrow("Это не GPX-файл");
    expect(() => parseGpx('<gpx><wpt lat="1" lon="1"/></gpx>')).toThrow(/хотя бы две точки/);
    expect(() =>
      parseGpx('<gpx><rtept lat="999" lon="1"/><rtept lat="x" lon="1"/></gpx>'),
    ).toThrow();
  });
});
