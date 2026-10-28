import "maplibre-gl/dist/maplibre-gl.css";
import type { GeoJSONSource, Map as MapLibreMap, Marker } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { bounds } from "../lib/plan";
import type { LonLat, RoutePoi } from "../lib/api";
import {
  DEFAULT_VIEW,
  MAP_STYLE_URL,
  ROUTE_CASING,
  ROUTE_COLOR,
  setupMapLibre,
} from "../lib/mapSetup";

export interface MapPoint {
  id: string;
  lat: number;
  lon: number;
  label: string;
  end: boolean;
}

interface Props {
  points: MapPoint[];
  line: LonLat[];
  nights: { position: LonLat; label: string }[];
  /** АЗС и жильё вдоль маршрута (v0.3): кружки, видны с приближения 8. */
  pois?: RoutePoi[];
  status?: string;
  onMapClick(lat: number, lon: number): void;
  onMarkerDrag(id: string, lat: number, lon: number): void;
}

const EMPTY_LINE = {
  type: "Feature" as const,
  properties: {},
  geometry: { type: "LineString" as const, coordinates: [] as LonLat[] },
};

/** Карта MapLibre на своих тайлах OSM, атрибуция обязательна (R-02). */
export function MapView({
  points,
  line,
  nights,
  pois = [],
  status,
  onMapClick,
  onMarkerDrag,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markers = useRef<Marker[]>([]);
  const nightMarkers = useRef<Marker[]>([]);
  const [ready, setReady] = useState(false);
  const handlers = useRef({ onMapClick, onMarkerDrag });
  handlers.current = { onMapClick, onMarkerDrag };

  useEffect(() => {
    if (!container.current) return;
    let map: MapLibreMap;
    try {
      const maplibregl = setupMapLibre();
      map = new maplibregl.Map({
        container: container.current,
        style: MAP_STYLE_URL,
        center: DEFAULT_VIEW.center,
        zoom: DEFAULT_VIEW.zoom,
        attributionControl: { compact: false, customAttribution: "© участники OpenStreetMap" },
      });
    } catch (error) {
      // Нет WebGL: карта недоступна, расчёты и путевой лист работают без неё.
      console.warn("Карта недоступна", error);
      return;
    }
    map.addControl(new (setupMapLibre().NavigationControl)({ showCompass: false }), "top-right");
    map.on("load", () => {
      map.addSource("route", { type: "geojson", data: EMPTY_LINE });
      map.addLayer({
        id: "route-casing",
        type: "line",
        source: "route",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": ROUTE_CASING, "line-width": 8 },
      });
      map.addLayer({
        id: "route-line",
        type: "line",
        source: "route",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": ROUTE_COLOR, "line-width": 4.5 },
      });
      map.addSource("pois", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "pois",
        type: "circle",
        source: "pois",
        minzoom: 8,
        paint: {
          "circle-radius": 5,
          "circle-color": ["case", ["==", ["get", "kind"], "fuel"], "#3C6B4B", "#E0892F"],
          "circle-stroke-color": "#FFFBF2",
          "circle-stroke-width": 1.5,
        },
      });
      setReady(true);
    });
    map.on("click", (e) => handlers.current.onMapClick(e.lngLat.lat, e.lngLat.lng));
    // Ошибки загрузки тайлов не мешают маршруту: подложку готовит владелец (docs/deploy.md).
    map.on("error", () => undefined);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const source = map.getSource("route") as GeoJSONSource | undefined;
    source?.setData({ ...EMPTY_LINE, geometry: { type: "LineString", coordinates: line } });
    const box = bounds(line);
    if (box) map.fitBounds(box, { padding: 60, maxZoom: 12, duration: 600 });
  }, [line, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    (map.getSource("pois") as GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      // На карте только АЗС и жильё; населённые пункты нужны лишь для границ дней.
      features: pois
        .filter((p) => !["city", "town", "village"].includes(p.kind))
        .map((p) => ({
          type: "Feature",
          properties: { kind: p.kind, name: p.name },
          geometry: { type: "Point", coordinates: [p.lon, p.lat] },
        })),
    });
  }, [pois, ready]);

  // Пока маршрута нет, показываем последнюю поставленную точку.
  const pointCount = points.length;
  useEffect(() => {
    const map = mapRef.current;
    const lastPoint = points[points.length - 1];
    if (!map || !ready || line.length || !lastPoint) return;
    map.easeTo({ center: [lastPoint.lon, lastPoint.lat], zoom: Math.max(map.getZoom(), 7) });
  }, [pointCount, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const maplibregl = setupMapLibre();
    markers.current.forEach((m) => m.remove());
    markers.current = points.map((p) => {
      const el = document.createElement("div");
      el.className = `map-marker${p.end ? " end" : ""}`;
      el.textContent = p.label;
      el.setAttribute("aria-label", `Точка ${p.label}`);
      const marker = new maplibregl.Marker({ element: el, draggable: true })
        .setLngLat([p.lon, p.lat])
        .addTo(map);
      marker.on("dragend", () => {
        const { lat, lng } = marker.getLngLat();
        handlers.current.onMarkerDrag(p.id, lat, lng);
      });
      return marker;
    });
  }, [points, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const maplibregl = setupMapLibre();
    nightMarkers.current.forEach((m) => m.remove());
    nightMarkers.current = nights.map((n) => {
      const el = document.createElement("div");
      el.className = "night-marker";
      el.textContent = n.label;
      return new maplibregl.Marker({ element: el }).setLngLat(n.position).addTo(map);
    });
  }, [nights, ready]);

  return (
    <div className="map-wrap">
      <div ref={container} className="map" aria-label="Карта маршрута" role="region" />
      {status && (
        <div className="map-status" role="status">
          <div>{status}</div>
        </div>
      )}
    </div>
  );
}
