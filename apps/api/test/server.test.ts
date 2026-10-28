import { describe, expect, it } from "vitest";
import { UserFacingError } from "../src/errors.js";
import type { GraphHopperClient, LegResult } from "../src/graphhopper.js";
import type { GeocoderClient } from "../src/photon.js";
import { buildServer, type RouteResponse } from "../src/server.js";

function fakeLeg(km: number): LegResult {
  const geometry: [number, number][] = [
    [37.6, 55.7],
    [37.7, 55.8],
  ];
  return {
    distanceKm: km,
    segments: [{ distanceKm: km, roadClass: "trunk" }],
    geometry,
    geometryKm: [0, km],
    fullGeometry: geometry,
    fullKm: [0, km],
  };
}

function setup(overrides: Partial<GraphHopperClient> = {}) {
  const calls: string[] = [];
  const graphhopper: GraphHopperClient = {
    async leg(from, to, profile, avoid) {
      const flags = `${avoid?.toll ? "+toll" : ""}${avoid?.motorway ? "+motorway" : ""}`;
      calls.push(`${profile}${flags}:${from.lat}->${to.lat}`);
      return fakeLeg(100);
    },
    ...overrides,
  };
  const geocoder: GeocoderClient = {
    async search(q) {
      return [{ name: q, description: "Россия", lat: 56.86, lon: 35.9 }];
    },
    async reverse() {
      return null;
    },
  };
  const app = buildServer({ config: { routeRateLimit: 100 }, graphhopper, geocoder });
  return { app, calls };
}

const points = [
  { lat: 1, lon: 37 },
  { lat: 2, lon: 37 },
  { lat: 3, lon: 37 },
];

describe("POST /api/route", () => {
  it("считает по отрезкам и складывает длину", async () => {
    const { app, calls } = setup();
    const response = await app.inject({ method: "POST", url: "/api/route", payload: { points } });
    expect(response.statusCode).toBe(200);
    const body = response.json<RouteResponse>();
    expect(body.legs).toHaveLength(2);
    expect(body.distanceKm).toBe(200);
    expect(body.zones[0]?.timeZone).toBe("Europe/Moscow");
    expect(calls).toEqual(["moto:1->2", "moto:2->3"]);
  });

  it("возврат добавляет отрезок к старту, грунт меняет профиль", async () => {
    const { app, calls } = setup();
    await app.inject({
      method: "POST",
      url: "/api/route",
      payload: { points, roundTrip: true, avoidUnpaved: false },
    });
    expect(calls).toEqual(["moto_unpaved:1->2", "moto_unpaved:2->3", "moto_unpaved:3->1"]);
  });

  it("избегание платных и магистралей передаётся в движок и в ключ кэша (M-02)", async () => {
    const { app, calls } = setup();
    await app.inject({
      method: "POST",
      url: "/api/route",
      payload: { points: points.slice(0, 2) },
    });
    await app.inject({
      method: "POST",
      url: "/api/route",
      payload: { points: points.slice(0, 2), avoidToll: true, avoidMotorways: true },
    });
    expect(calls).toEqual(["moto:1->2", "moto+toll+motorway:1->2"]);
  });

  it("повторный расчёт берёт отрезки из кэша (R-09)", async () => {
    const { app, calls } = setup();
    await app.inject({ method: "POST", url: "/api/route", payload: { points } });
    await app.inject({
      method: "POST",
      url: "/api/route",
      payload: { points: [...points, { lat: 4, lon: 37 }] },
    });
    expect(calls).toEqual(["moto:1->2", "moto:2->3", "moto:3->4"]);
  });

  it("одна точка: понятная ошибка запроса", async () => {
    const { app } = setup();
    const response = await app.inject({
      method: "POST",
      url: "/api/route",
      payload: { points: [points[0]] },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().message).toBe("Некорректный запрос");
  });

  it("ошибка движка с текстом для пользователя", async () => {
    const { app } = setup({
      async leg() {
        throw new UserFacingError("Маршрут не найден", 422, "no_route");
      },
    });
    const response = await app.inject({ method: "POST", url: "/api/route", payload: { points } });
    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({ error: "no_route", message: "Маршрут не найден" });
  });
});

describe("поиск адресов", () => {
  it("GET /api/geocode", async () => {
    const { app } = setup();
    const response = await app.inject({ method: "GET", url: "/api/geocode?q=Тверь" });
    expect(response.json().places[0].name).toBe("Тверь");
  });

  it("слишком короткий запрос", async () => {
    const { app } = setup();
    expect((await app.inject({ method: "GET", url: "/api/geocode?q=Т" })).statusCode).toBe(400);
  });
});

describe("раздача веб-приложения", () => {
  it("страницы отдают index.html, отсутствующие файлы 404", async () => {
    const { mkdtempSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const dir = mkdtempSync(`${tmpdir()}/versta-web-`);
    writeFileSync(`${dir}/index.html`, "<!doctype html><title>Верста</title>");
    const geocoder: GeocoderClient = { search: async () => [], reverse: async () => null };
    const graphhopper: GraphHopperClient = { leg: async () => fakeLeg(1) };
    const app = buildServer({ config: { routeRateLimit: 10, webDir: dir }, graphhopper, geocoder });
    const page = await app.inject({ method: "GET", url: "/plan" });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain("Верста");
    expect((await app.inject({ method: "GET", url: "/assets/old-123.js" })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: "/api/nope" })).json().error).toBe("not_found");
  });
});

describe("тайлы", () => {
  it("отдаёт PMTiles кусками по Range", async () => {
    const { mkdtempSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const dir = mkdtempSync(`${tmpdir()}/versta-tiles-`);
    writeFileSync(`${dir}/region.pmtiles`, Buffer.from("0123456789"));
    const geocoder: GeocoderClient = { search: async () => [], reverse: async () => null };
    const graphhopper: GraphHopperClient = { leg: async () => fakeLeg(1) };
    const app = buildServer({
      config: { routeRateLimit: 10, tilesDir: dir },
      graphhopper,
      geocoder,
    });
    const part = await app.inject({
      method: "GET",
      url: "/tiles/region.pmtiles",
      headers: { range: "bytes=2-4" },
    });
    expect(part.statusCode).toBe(206);
    expect(part.body).toBe("234");
  });
});

describe("GET /api/weather", () => {
  it("отдаёт погоду и проверяет дату", async () => {
    const geocoder: GeocoderClient = { search: async () => [], reverse: async () => null };
    const graphhopper: GraphHopperClient = { leg: async () => fakeLeg(1) };
    const app = buildServer({
      config: { routeRateLimit: 10 },
      graphhopper,
      geocoder,
      weather: {
        day: async (lat, lon, date) => ({
          kind: "forecast",
          date,
          tempMaxC: 20,
          tempMinC: 10,
          precipitationMm: 0,
          windMaxKmh: 10,
        }),
      },
    });
    const ok = await app.inject({
      method: "GET",
      url: "/api/weather?lat=55.7&lon=37.6&date=2026-07-01",
    });
    expect(ok.json().weather.tempMaxC).toBe(20);
    expect(
      (await app.inject({ method: "GET", url: "/api/weather?lat=55.7&lon=37.6&date=1.7.2026" }))
        .statusCode,
    ).toBe(400);
  });
});
