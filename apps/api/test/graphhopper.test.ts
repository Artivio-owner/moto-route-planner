import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
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
});
