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
