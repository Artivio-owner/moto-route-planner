// Клиент API (apps/api).
import type { Segment, ZoneMark } from "@versta/calc";

export type LonLat = [number, number];

export interface RouteLeg {
  distanceKm: number;
  segments: Segment[];
  geometry: LonLat[];
  geometryKm: number[];
  /** Высота точек geometry, м (E-01); нет, если сервер без данных высот. */
  elevation?: number[];
}

export interface RouteResponse {
  legs: RouteLeg[];
  zones: ZoneMark[];
  distanceKm: number;
}

export interface Place {
  name: string;
  description: string;
  lat: number;
  lon: number;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

async function call<T>(input: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(input, init);
  } catch {
    throw new ApiError("Нет связи с сервером. Проверьте интернет и попробуйте ещё раз", "network");
  }
  const body = (await response.json().catch(() => ({}))) as { message?: string; error?: string };
  if (!response.ok) {
    throw new ApiError(body.message ?? "Сервис временно недоступен", body.error ?? "http_error");
  }
  return body as T;
}

export function fetchRoute(
  points: { lat: number; lon: number }[],
  options: {
    roundTrip: boolean;
    avoidUnpaved: boolean;
    avoidToll: boolean;
    avoidMotorways: boolean;
  },
  signal?: AbortSignal,
): Promise<RouteResponse> {
  const init: RequestInit = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ points: points.map(({ lat, lon }) => ({ lat, lon })), ...options }),
  };
  if (signal) init.signal = signal;
  return call<RouteResponse>("/api/route", init);
}

export async function searchPlaces(query: string, signal?: AbortSignal): Promise<Place[]> {
  const init: RequestInit = {};
  if (signal) init.signal = signal;
  return (
    await call<{ places: Place[] }>(`/api/geocode?${new URLSearchParams({ q: query })}`, init)
  ).places;
}

export async function reversePlace(lat: number, lon: number): Promise<Place | null> {
  try {
    const params = new URLSearchParams({ lat: lat.toFixed(5), lon: lon.toFixed(5) });
    return (await call<{ place: Place | null }>(`/api/reverse?${params}`)).place;
  } catch {
    return null;
  }
}

export function coordsName(lat: number, lon: number): string {
  return `Точка ${lat.toFixed(4)}, ${lon.toFixed(4)}`;
}

export interface DayWeather {
  kind: "forecast" | "climate";
  date: string;
  tempMaxC: number;
  tempMinC: number;
  precipitationMm: number;
  precipitationProbability?: number;
  windMaxKmh: number;
  weatherCode?: number;
  years?: number;
}

export async function fetchWeather(lat: number, lon: number, date: string): Promise<DayWeather> {
  const params = new URLSearchParams({ lat: lat.toFixed(3), lon: lon.toFixed(3), date });
  return (await call<{ weather: DayWeather }>(`/api/weather?${params}`)).weather;
}
