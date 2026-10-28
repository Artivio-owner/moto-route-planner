// Экспорт GPX 1.1: задача X-01. Точки маршрута как <wpt>, геометрия по дням как <trk>.

export interface GpxPoint {
  lat: number;
  lon: number;
}

export interface GpxWaypoint extends GpxPoint {
  name: string;
}

export interface GpxDay {
  name: string;
  points: GpxPoint[];
}

export interface GpxInput {
  name: string;
  waypoints: GpxWaypoint[];
  days: GpxDay[];
  /** Время создания файла, ISO. */
  createdAt: string;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const coord = (value: number): string => value.toFixed(6);

export function buildGpx(input: GpxInput): string {
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="Верста" xmlns="http://www.topografix.com/GPX/1/1" ' +
      'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
      'xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">',
    "  <metadata>",
    `    <name>${escapeXml(input.name)}</name>`,
    '    <copyright author="OpenStreetMap contributors"><license>https://opendatacommons.org/licenses/odbl/</license></copyright>',
    `    <time>${escapeXml(input.createdAt)}</time>`,
    "  </metadata>",
  ];
  for (const wpt of input.waypoints) {
    lines.push(
      `  <wpt lat="${coord(wpt.lat)}" lon="${coord(wpt.lon)}"><name>${escapeXml(wpt.name)}</name></wpt>`,
    );
  }
  for (const day of input.days) {
    lines.push("  <trk>", `    <name>${escapeXml(day.name)}</name>`, "    <trkseg>");
    for (const p of day.points)
      lines.push(`      <trkpt lat="${coord(p.lat)}" lon="${coord(p.lon)}"/>`);
    lines.push("    </trkseg>", "  </trk>");
  }
  lines.push("</gpx>", "");
  return lines.join("\n");
}

/** Имя файла без запрещённых символов: «versta_Сочи-Владивосток_2026-07-01.gpx». */
export function exportFileName(
  from: string,
  to: string,
  date: string,
  extension: "gpx" | "pdf",
): string {
  const clean = (text: string): string => text.replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 40);
  return `versta_${clean(from)}-${clean(to)}_${date}.${extension}`;
}

// Импорт GPX: задача X-05. Из файла берём только точки для построения маршрута:
// сам маршрут строится заново нашим движком, поэтому трек прореживается.

/** Максимум точек маршрута из файла (длина ссылки проверена на 25 точках, X-09). */
export const GPX_IMPORT_MAX_POINTS = 25;
/** Сколько точек берём с трека: старт, финиш и равномерно между ними. */
export const GPX_TRACK_SAMPLE = 10;

export interface GpxImport {
  name: string;
  /** Откуда взяты точки: маршрут, точки «Версты», трек или путевые точки. */
  source: "route" | "waypoints" | "track";
  points: (GpxPoint & { name?: string })[];
  /** Точек в файле было больше лимита, часть пропущена. */
  truncated: boolean;
}

function unescapeXml(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, "&")
    .trim();
}

function attr(attrs: string, key: string): number {
  const match = new RegExp(`\\b${key}\\s*=\\s*["']([^"']+)["']`).exec(attrs);
  return match ? Number(match[1]) : NaN;
}

function tagText(body: string, tag: string): string {
  const match = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`).exec(body);
  return match?.[1] ? unescapeXml(match[1]) : "";
}

function pointsOf(xml: string, tag: "wpt" | "rtept" | "trkpt"): (GpxPoint & { name?: string })[] {
  const re = new RegExp(`<${tag}\\b([^>]*?)(?:/>|>([\\s\\S]*?)</${tag}>)`, "g");
  const result: (GpxPoint & { name?: string })[] = [];
  for (const match of xml.matchAll(re)) {
    const lat = attr(match[1] ?? "", "lat");
    const lon = attr(match[1] ?? "", "lon");
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180)
      continue;
    const name = tagText(match[2] ?? "", "name");
    result.push(name ? { lat, lon, name } : { lat, lon });
  }
  return result;
}

function distanceKm(a: GpxPoint, b: GpxPoint): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

/** Точки трека через равные расстояния: первая, последняя и count − 2 между ними. */
export function sampleTrack<T extends GpxPoint>(track: readonly T[], count: number): T[] {
  if (track.length <= count) return [...track];
  const cumulative = [0];
  for (let i = 1; i < track.length; i++) {
    cumulative.push(
      (cumulative[i - 1] ?? 0) + distanceKm(track[i - 1] as GpxPoint, track[i] as GpxPoint),
    );
  }
  const total = cumulative[cumulative.length - 1] ?? 0;
  const result: T[] = [track[0] as T];
  let j = 0;
  for (let k = 1; k < count - 1; k++) {
    const target = (total * k) / (count - 1);
    while (j < track.length - 1 && (cumulative[j] ?? 0) < target) j++;
    const candidate = track[j] as T;
    if (candidate !== result[result.length - 1]) result.push(candidate);
  }
  result.push(track[track.length - 1] as T);
  return result;
}

/**
 * Разбор GPX 1.0/1.1. Порядок выбора: маршрут (rtept); точки нашего же экспорта (wpt);
 * трек (trkpt), прореженный до GPX_TRACK_SAMPLE точек; путевые точки (wpt).
 * Бросает Error с понятным текстом, если точек меньше двух.
 */
export function parseGpx(xml: string): GpxImport {
  if (!/<gpx\b/.test(xml)) throw new Error("Это не GPX-файл");
  const metadata = /<metadata\b[^>]*>([\s\S]*?)<\/metadata>/.exec(xml)?.[1] ?? "";
  const name = tagText(metadata, "name") || tagText(xml, "name");
  const route = pointsOf(xml, "rtept");
  const waypoints = pointsOf(xml, "wpt");
  const fromVersta = /<gpx\b[^>]*creator\s*=\s*["']Верста["']/.test(xml);
  let source: GpxImport["source"];
  let points: GpxImport["points"];
  let truncated = false;
  if (route.length >= 2) {
    source = "route";
    points = route;
  } else if (fromVersta && waypoints.length >= 2) {
    source = "waypoints";
    points = waypoints;
  } else {
    const track = pointsOf(xml, "trkpt");
    if (track.length >= 2) {
      source = "track";
      points = sampleTrack(track, GPX_TRACK_SAMPLE);
    } else if (waypoints.length >= 2) {
      source = "waypoints";
      points = waypoints;
    } else {
      throw new Error("В файле нет маршрута: нужны хотя бы две точки");
    }
  }
  if (points.length > GPX_IMPORT_MAX_POINTS) {
    // Лишние промежуточные точки прореживаем, старт и финиш сохраняем.
    points = sampleTrack(points, GPX_IMPORT_MAX_POINTS);
    truncated = true;
  }
  return { name, source, points, truncated };
}
