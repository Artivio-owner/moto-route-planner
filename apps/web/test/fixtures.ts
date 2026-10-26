import type { RouteResponse } from "../src/lib/api";

/** Ответ API для маршрута из трёх точек: 900 км, смена пояса на 600-м км. */
export const route: RouteResponse = {
  distanceKm: 900,
  zones: [
    { fromKm: 0, timeZone: "Europe/Moscow" },
    { fromKm: 600, timeZone: "Europe/Samara" },
  ],
  legs: [
    {
      distanceKm: 500,
      segments: [
        { distanceKm: 300, roadClass: "trunk" },
        { distanceKm: 200, roadClass: "motorway", toll: true },
      ],
      geometry: [
        [37.6, 55.7],
        [42, 55.5],
        [44, 56.3],
      ],
      geometryKm: [0, 280, 500],
    },
    {
      distanceKm: 400,
      segments: [{ distanceKm: 400, roadClass: "regional" }],
      geometry: [
        [44, 56.3],
        [49.1, 55.8],
      ],
      geometryKm: [0, 400],
    },
  ],
};
