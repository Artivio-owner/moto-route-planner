import { describe, expect, it } from "vitest";
import { featureToPlace } from "../src/photon.js";

describe("featureToPlace", () => {
  it("город: название и регион", () => {
    expect(
      featureToPlace({
        geometry: { coordinates: [35.9, 56.86] },
        properties: { name: "Тверь", state: "Тверская область", country: "Россия", type: "city" },
      }),
    ).toEqual({ name: "Тверь", description: "Тверская область, Россия", lat: 56.86, lon: 35.9 });
  });

  it("адрес без названия: улица и дом", () => {
    const place = featureToPlace({
      geometry: { coordinates: [37.6, 55.7] },
      properties: { street: "Тверская улица", housenumber: "1", city: "Москва", country: "Россия" },
    });
    expect(place.name).toBe("Тверская улица, 1");
    expect(place.description).toBe("Москва, Россия");
  });
});
