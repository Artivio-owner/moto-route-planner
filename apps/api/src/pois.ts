// АЗС и жильё вдоль маршрута: задачи P-01, P-02, P-07 (v0.3), ADR-0017.
// Точки берутся из выгрузки OSM (prepare-data.sh: osmium tags-filter и export в GeoJSONSeq),
// хранятся в памяти с сеточным индексом. Отдельная база (PostGIS) не нужна: для России это
// десятки тысяч точек (оценка, не проверено на реальных данных, S-04).

import { readFileSync } from "node:fs";
import { haversineKm, projectToSegment, type LonLat } from "./geometry.js";

export const POI_KINDS = [
  "fuel",
  "hotel",
  "motel",
  "guest_house",
  "hostel",
  "camp_site",
  "chalet",
  "city",
  "town",
  "village",
] as const;
export type PoiKind = (typeof POI_KINDS)[number];

export interface Poi {
  kind: PoiKind;
  name: string;
  lat: number;
  lon: number;
}

/** Точка вдоль маршрута: км от старта и удаление от линии маршрута. */
export interface RoutePoi extends Poi {
  km: number;
  offKm: number;
}

/** Насколько далеко от линии маршрута ищем: АЗС у самой дороги, жильё чуть дальше. */
export const SEARCH_RADIUS_KM: Record<"fuel" | "lodging" | "place", number> = {
  fuel: 1,
  lodging: 5,
  place: 3,
};

const PLACE_KINDS = new Set<PoiKind>(["city", "town", "village"]);

function radiusOf(kind: PoiKind): number {
  if (kind === "fuel") return SEARCH_RADIUS_KM.fuel;
  return PLACE_KINDS.has(kind) ? SEARCH_RADIUS_KM.place : SEARCH_RADIUS_KM.lodging;
}
const CELL_DEG = 0.1;
const RS = String.fromCharCode(0x1e);
const SAMPLE_STEP_KM = 1;

interface Feature {
  geometry?: { type: string; coordinates: unknown };
  properties?: Record<string, unknown>;
}

function kindOf(tags: Record<string, unknown>): PoiKind | null {
  if (tags.amenity === "fuel") return "fuel";
  // Населённые пункты нужны для привязки границ дня (C-10).
  if (tags.place === "city" || tags.place === "town" || tags.place === "village") return tags.place;
  const tourism = tags.tourism;
  return typeof tourism === "string" && (POI_KINDS as readonly string[]).includes(tourism)
    ? (tourism as PoiKind)
    : null;
}

/** Точка объекта: сама точка или среднее вершин внешнего кольца (для зданий хватает). */
function centerOf(geometry: Feature["geometry"]): LonLat | null {
  if (!geometry) return null;
  const c = geometry.coordinates;
  const ring = (points: unknown): LonLat | null => {
    if (!Array.isArray(points) || !points.length) return null;
    let x = 0;
    let y = 0;
    for (const p of points as number[][]) {
      x += p[0] ?? 0;
      y += p[1] ?? 0;
    }
    return [x / points.length, y / points.length];
  };
  switch (geometry.type) {
    case "Point":
      return Array.isArray(c) && typeof c[0] === "number" ? [c[0], c[1] as number] : null;
    case "LineString":
      return ring(c);
    case "Polygon":
      return ring((c as unknown[])[0]);
    case "MultiPolygon":
      return ring(((c as unknown[][])[0] ?? [])[0]);
    default:
      return null;
  }
}

/** Разбор GeoJSONSeq от `osmium export` (по объекту в строке, разделитель RS допускается). */
export function parsePois(text: string): Poi[] {
  const pois: Poi[] = [];
  for (const rawLine of text.split("\n")) {
    // Разделитель записей RS (0x1E) по RFC 8142 в начале строки отбрасываем.
    const line = (rawLine.startsWith(RS) ? rawLine.slice(1) : rawLine).trim();
    if (!line) continue;
    let feature: Feature;
    try {
      feature = JSON.parse(line) as Feature;
    } catch {
      continue;
    }
    const tags = feature.properties ?? {};
    const kind = kindOf(tags);
    const center = centerOf(feature.geometry);
    if (!kind || !center) continue;
    const name = [tags["name:ru"], tags.name, tags.brand].find(
      (v): v is string => typeof v === "string" && v.trim() !== "",
    );
    pois.push({ kind, name: name?.trim() ?? "", lat: center[1], lon: center[0] });
  }
  return pois;
}

export class PoiIndex {
  private readonly cells = new Map<string, Poi[]>();
  readonly size: number;

  constructor(pois: readonly Poi[]) {
    for (const poi of pois) {
      const key = PoiIndex.key(Math.floor(poi.lon / CELL_DEG), Math.floor(poi.lat / CELL_DEG));
      const cell = this.cells.get(key);
      if (cell) cell.push(poi);
      else this.cells.set(key, [poi]);
    }
    this.size = pois.length;
  }

  private static key(x: number, y: number): string {
    return `${x}:${y}`;
  }

  /** Точки в квадрате вокруг точки: сначала грубо по ячейкам, расстояние проверяет вызывающий. */
  near(point: LonLat, radiusKm: number): Poi[] {
    const dLat = radiusKm / 111;
    const dLon = radiusKm / (111 * Math.max(0.1, Math.cos((point[1] * Math.PI) / 180)));
    const x0 = Math.floor((point[0] - dLon) / CELL_DEG);
    const x1 = Math.floor((point[0] + dLon) / CELL_DEG);
    const y0 = Math.floor((point[1] - dLat) / CELL_DEG);
    const y1 = Math.floor((point[1] + dLat) / CELL_DEG);
    const result: Poi[] = [];
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) result.push(...(this.cells.get(PoiIndex.key(x, y)) ?? []));
    }
    return result;
  }

  /**
   * Точки вдоль линии маршрута. Линия проверяется через каждый километр; для точки берётся
   * ближайшая проверка: её километр и расстояние до неё.
   */
  alongRoute(points: readonly LonLat[], km: readonly number[], offsetKm = 0): RoutePoi[] {
    const best = new Map<Poi, RoutePoi>();
    const maxRadius = Math.max(...Object.values(SEARCH_RADIUS_KM));
    const keep = (poi: Poi, offKm: number, atKm: number): void => {
      if (offKm > radiusOf(poi.kind)) return;
      const known = best.get(poi);
      if (!known || offKm < known.offKm) {
        best.set(poi, { ...poi, km: offsetKm + atKm, offKm: Math.round(offKm * 100) / 100 });
      }
    };
    if (points.length === 1 && points[0]) {
      for (const poi of this.near(points[0], maxRadius))
        keep(poi, haversineKm(points[0], [poi.lon, poi.lat]), 0);
    }
    // Вершины бывают далеко друг от друга (прямые участки): кандидатов ищем через каждый
    // километр участка, а расстояние и километр считаем по самому участку линии.
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i] as LonLat;
      const b = points[i + 1] as LonLat;
      const k0 = km[i] ?? 0;
      const length = (km[i + 1] ?? k0) - k0;
      const candidates = new Set<Poi>();
      for (let d = 0; d <= length + 1e-9; d += SAMPLE_STEP_KM) {
        const t = length === 0 ? 0 : Math.min(1, d / length);
        const sample: LonLat = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        for (const poi of this.near(sample, maxRadius + SAMPLE_STEP_KM)) candidates.add(poi);
      }
      for (const poi of this.near(b, maxRadius)) candidates.add(poi);
      for (const poi of candidates) {
        const { km: offKm, t } = projectToSegment([poi.lon, poi.lat], a, b);
        keep(poi, offKm, k0 + t * length);
      }
    }
    return [...best.values()].sort((a, b) => a.km - b.km);
  }
}

export function dedupePois(pois: readonly RoutePoi[]): RoutePoi[] {
  const best = new Map<string, RoutePoi>();
  for (const poi of pois) {
    const key = `${poi.kind}|${poi.lat}|${poi.lon}`;
    const known = best.get(key);
    if (!known || poi.offKm < known.offKm) best.set(key, poi);
  }
  return [...best.values()].sort((a, b) => a.km - b.km);
}

/** Загрузка файла точек; нет файла или он пустой: сервис работает без слоя POI. */
export function loadPoiIndex(path: string | undefined): PoiIndex | null {
  if (!path) return null;
  try {
    const index = new PoiIndex(parsePois(readFileSync(path, "utf8")));
    return index.size ? index : null;
  } catch {
    return null;
  }
}
