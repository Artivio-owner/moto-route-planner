import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { simplifyProfileIndices } from "../src/geometry.js";
import {
  avoidModel,
  createGraphHopperClient,
  explainGraphHopperError,
  mapRoadClass,
  pathToLeg,
} from "../src/graphhopper.js";

const fixture = (name: string) =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"));

describe("pathToLeg", () => {
  it("паром: отдельный участок с временем из GraphHopper", () => {
    const leg = pathToLeg(fixture("gh-ferry").paths[0]);
    const ferry = leg.segments.find((s) => s.ferry);
    expect(ferry).toBeDefined();
    expect(ferry?.fixedDurationH).toBeCloseTo(3280051 / 3600000, 3);
    expect(leg.distanceKm).toBeCloseTo(19.13, 1);
  });

  it("платный участок помечен, классы сведены к нашим четырём", () => {
    const leg = pathToLeg(fixture("gh-toll").paths[0]);
    expect(leg.segments.map((s) => [s.roadClass, s.toll ?? false])).toEqual([
      ["regional", false],
      ["motorway", true],
    ]);
    const total = leg.segments.reduce((sum, s) => sum + s.distanceKm, 0);
    expect(total).toBeCloseTo(leg.distanceKm, 6);
  });

  it("упрощённая геометрия начинается и кончается там же, километры растут", () => {
    const leg = pathToLeg(fixture("gh-toll").paths[0]);
    expect(leg.geometry[0]).toEqual(leg.fullGeometry[0]);
    expect(leg.geometry.at(-1)).toEqual(leg.fullGeometry.at(-1));
    expect(leg.geometryKm.at(-1)).toBeCloseTo(leg.distanceKm);
  });
});

describe("классы и ошибки", () => {
  it("классы дорог", () => {
    expect(
      ["motorway", "trunk", "primary", "secondary", "tertiary", "residential", undefined].map(
        mapRoadClass,
      ),
    ).toEqual(["motorway", "trunk", "regional", "regional", "local", "local", "local"]);
  });

  it("точка вне покрытия", () => {
    const error = explainGraphHopperError(fixture("gh-error").message);
    expect(error.code).toBe("point_not_found");
    expect(error.message).toMatch(/^Точка 2 вне зоны покрытия/);
  });

  it("нет дороги", () => {
    expect(explainGraphHopperError("Connection between locations not found").code).toBe("no_route");
  });

  it("клиент переводит ответ с ошибкой в понятный текст", async () => {
    const fakeFetch = (async () =>
      new Response(JSON.stringify(fixture("gh-error")), {
        status: 400,
      })) as unknown as typeof fetch;
    const client = createGraphHopperClient("http://gh", 1000, fakeFetch);
    await expect(
      client.leg({ lat: 55, lon: 37 }, { lat: 59, lon: 40.6 }, "moto"),
    ).rejects.toMatchObject({
      code: "point_not_found",
    });
  });

  it("недоступный движок", async () => {
    const fakeFetch = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const client = createGraphHopperClient("http://gh", 1000, fakeFetch);
    await expect(
      client.leg({ lat: 55, lon: 37 }, { lat: 55, lon: 38 }, "moto"),
    ).rejects.toMatchObject({
      code: "engine_unavailable",
    });
  });

  it("избегание: своя модель в запросе и отключение CH (M-02)", async () => {
    let sent: Record<string, unknown> = {};
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      sent = JSON.parse(String(init.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({ message: "Connection between locations not found" }), {
        status: 400,
      });
    }) as unknown as typeof fetch;
    const client = createGraphHopperClient("http://gh", 1000, fakeFetch);
    await expect(
      client.leg({ lat: 55, lon: 37 }, { lat: 55, lon: 38 }, "moto", { toll: true }),
    ).rejects.toMatchObject({ code: "no_route" });
    expect(sent["ch.disable"]).toBe(true);
    expect(sent["custom_model"]).toEqual({
      priority: [{ if: "toll == ALL", multiply_by: "0.1" }],
    });
    expect(avoidModel({})).toBeNull();
    expect(avoidModel({ motorway: true })?.priority).toHaveLength(1);
  });

  it("высоты (E-01): перевал на прямой дороге не теряется при упрощении", () => {
    // Прямая на восток 11 точек, в середине холм 400 м.
    const coordinates = Array.from({ length: 11 }, (_, i) => [
      37 + i * 0.01,
      55,
      i === 5 ? 400 : 150,
    ]);
    const leg = pathToLeg({
      distance: 6400,
      time: 300000,
      points: { coordinates },
      details: { road_class: [[0, 10, "primary"]] },
    });
    expect(leg.elevation).toBeDefined();
    expect(leg.elevation?.length).toBe(leg.geometry.length);
    expect(Math.max(...(leg.elevation ?? []))).toBe(400);
    const flat = pathToLeg({
      distance: 6400,
      time: 300000,
      points: { coordinates: coordinates.map(([x, y]) => [x as number, y as number]) },
      details: {},
    });
    expect(flat.elevation).toBeUndefined();
    expect(flat.geometry).toHaveLength(2);
  });

  it("упрощение профиля оставляет точки с отклонением больше допуска", () => {
    expect(simplifyProfileIndices([0, 1, 2, 3], [100, 200, 300, 100], 10)).toEqual([0, 2, 3]);
    expect(simplifyProfileIndices([0, 1], [0, 0], 10)).toEqual([0, 1]);
  });
});
