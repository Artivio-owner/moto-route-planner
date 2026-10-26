// Общая настройка MapLibre: протокол PMTiles для своих тайлов (ADR-0004).
import * as maplibregl from "maplibre-gl";
// Рабочий поток MapLibre собираем отдельным модулем: иначе после сборки он ищется рядом с чанком.
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { Protocol } from "pmtiles";

let registered = false;

export function setupMapLibre(): typeof maplibregl {
  if (!registered) {
    maplibregl.setWorkerUrl(workerUrl);
    maplibregl.addProtocol("pmtiles", new Protocol().tile);
    registered = true;
  }
  return maplibregl;
}

export const MAP_STYLE_URL = "/map/style.json";
/** Вид по умолчанию: европейская часть России. */
export const DEFAULT_VIEW = { center: [45, 55] as [number, number], zoom: 3.4 };

export const ROUTE_COLOR = "#3C6B4B";
export const ROUTE_CASING = "#FFFBF2";
