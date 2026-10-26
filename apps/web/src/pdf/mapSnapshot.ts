// Снимок карты для PDF на наших тайлах (ADR-0004: Яндекс запрещает скриншоты).
import type { LonLat } from "../lib/api";
import { bounds } from "../lib/plan";
import { MAP_STYLE_URL, ROUTE_CASING, ROUTE_COLOR, setupMapLibre } from "../lib/mapSetup";

export interface Snapshot {
  png: Uint8Array;
  width: number;
  height: number;
}

/** Рисует маршрут на карте вне экрана и возвращает PNG. При любой ошибке возвращает null. */
export async function mapSnapshot(
  line: LonLat[],
  nights: LonLat[],
  width = 1400,
  height = 1000,
  timeoutMs = 10000,
): Promise<Snapshot | null> {
  const box = bounds(line);
  if (!box) return null;
  const container = document.createElement("div");
  container.style.cssText = `position:fixed;left:-10000px;top:0;width:${width / 2}px;height:${height / 2}px`;
  document.body.append(container);
  try {
    const maplibregl = setupMapLibre();
    const map = new maplibregl.Map({
      container,
      style: MAP_STYLE_URL,
      bounds: box,
      fitBoundsOptions: { padding: 40 },
      interactive: false,
      attributionControl: false,
      pixelRatio: 2,
      canvasContextAttributes: { preserveDrawingBuffer: true },
    });
    map.on("error", () => undefined);
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error("timeout")), timeoutMs);
      map.once("load", () => {
        map.addSource("route", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: line },
          },
        });
        map.addLayer({
          id: "casing",
          type: "line",
          source: "route",
          paint: { "line-color": ROUTE_CASING, "line-width": 7 },
        });
        map.addLayer({
          id: "line",
          type: "line",
          source: "route",
          paint: { "line-color": ROUTE_COLOR, "line-width": 4 },
        });
        map.addSource("nights", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: nights.map((p) => ({
              type: "Feature",
              properties: {},
              geometry: { type: "Point", coordinates: p },
            })),
          },
        });
        map.addSource("ends", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: [line[0], line[line.length - 1]].map((p, i) => ({
              type: "Feature",
              properties: { end: i === 1 },
              geometry: { type: "Point", coordinates: p as LonLat },
            })),
          },
        });
        map.addLayer({
          id: "ends",
          type: "circle",
          source: "ends",
          paint: {
            "circle-radius": 8,
            "circle-color": ["case", ["get", "end"], "#E0892F", "#FFFBF2"],
            "circle-stroke-color": ["case", ["get", "end"], "#FFFBF2", "#3C6B4B"],
            "circle-stroke-width": 3,
          },
        });
        map.addLayer({
          id: "nights",
          type: "circle",
          source: "nights",
          paint: {
            "circle-radius": 6,
            "circle-color": "#E0892F",
            "circle-stroke-color": "#FFFBF2",
            "circle-stroke-width": 2,
          },
        });
        map.once("idle", () => {
          window.clearTimeout(timer);
          resolve();
        });
      });
    });
    const dataUrl = map.getCanvas().toDataURL("image/png");
    map.remove();
    const base64 = dataUrl.split(",")[1] ?? "";
    return { png: Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)), width, height };
  } catch {
    return null;
  } finally {
    container.remove();
  }
}
