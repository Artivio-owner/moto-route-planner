// Поиск адресов через Photon (self-hosted, данные OSM): задачи R-03, S-02.

import { UserFacingError } from "./errors.js";

export interface Place {
  name: string;
  /** Уточнение: регион, страна. */
  description: string;
  lat: number;
  lon: number;
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    name?: string;
    street?: string;
    housenumber?: string;
    city?: string;
    district?: string;
    county?: string;
    state?: string;
    country?: string;
    type?: string;
  };
}

export function featureToPlace(feature: PhotonFeature): Place {
  const p = feature.properties;
  const street = [p.street, p.housenumber].filter(Boolean).join(", ");
  const name = p.name ?? (street || p.city || "Без названия");
  const parts = [
    p.name && street ? street : undefined,
    p.city !== name ? p.city : undefined,
    p.state,
    p.country,
  ];
  const description = [...new Set(parts.filter((x): x is string => Boolean(x) && x !== name))].join(
    ", ",
  );
  return {
    name,
    description,
    lat: feature.geometry.coordinates[1],
    lon: feature.geometry.coordinates[0],
  };
}

export interface GeocoderClient {
  search(query: string, near?: { lat: number; lon: number }): Promise<Place[]>;
  reverse(lat: number, lon: number): Promise<Place | null>;
}

export function createPhotonClient(
  baseUrl: string,
  timeoutMs: number,
  fetchImpl: typeof fetch = fetch,
): GeocoderClient {
  async function get(path: string, params: Record<string, string>): Promise<PhotonFeature[]> {
    const url = `${baseUrl}${path}?${new URLSearchParams(params)}`;
    let response: Response;
    try {
      response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
    } catch {
      throw new UserFacingError(
        "Поиск адресов недоступен. Попробуйте позже или поставьте точку на карте",
        503,
        "geocoder_unavailable",
      );
    }
    if (!response.ok)
      throw new UserFacingError(
        "Поиск адресов не ответил. Попробуйте позже",
        502,
        "geocoder_error",
      );
    return ((await response.json()) as { features?: PhotonFeature[] }).features ?? [];
  }
  return {
    async search(query, near) {
      const params: Record<string, string> = { q: query, limit: "7", lang: "default" };
      if (near) {
        params.lat = String(near.lat);
        params.lon = String(near.lon);
      }
      return (await get("/api", params)).map(featureToPlace);
    },
    async reverse(lat, lon) {
      const [feature] = await get("/reverse", {
        lat: String(lat),
        lon: String(lon),
        lang: "default",
      });
      return feature ? featureToPlace(feature) : null;
    },
  };
}
