import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import type { Segment, ZoneMark } from "@versta/calc";
import { LruCache } from "./cache.js";
import type { ApiConfig } from "./config.js";
import { UserFacingError } from "./errors.js";
import type { LonLat } from "./geometry.js";
import type { GraphHopperClient, LatLon, LegResult } from "./graphhopper.js";
import type { GeocoderClient } from "./photon.js";
import type { WeatherClient } from "./weather.js";
import { zoneMarks } from "./zones.js";

export interface RouteRequest {
  points: LatLon[];
  roundTrip?: boolean;
  avoidUnpaved?: boolean;
}

export interface RouteLeg {
  distanceKm: number;
  segments: Segment[];
  geometry: LonLat[];
  geometryKm: number[];
}

export interface RouteResponse {
  legs: RouteLeg[];
  zones: ZoneMark[];
  distanceKm: number;
}

export interface Dependencies {
  config: Pick<ApiConfig, "routeRateLimit" | "webDir" | "tilesDir">;
  graphhopper: GraphHopperClient;
  geocoder: GeocoderClient;
  weather?: WeatherClient;
}

const pointSchema = {
  type: "object",
  required: ["lat", "lon"],
  additionalProperties: false,
  properties: {
    lat: { type: "number", minimum: -90, maximum: 90 },
    lon: { type: "number", minimum: -180, maximum: 180 },
  },
} as const;

/** Сколько отрезков считаем одновременно: защита движка без ограничения длины маршрута (ADR-0011). */
const LEG_CONCURRENCY = 4;

async function mapLimited<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index] as T);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export function buildServer(deps: Dependencies): FastifyInstance {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" }, trustProxy: true });
  const legCache = new LruCache<LegResult>(500);

  app.register(rateLimit, { global: false });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof UserFacingError) {
      return reply.status(error.statusCode).send({ error: error.code, message: error.message });
    }
    const status = (error as { statusCode?: number }).statusCode ?? 500;
    if (status === 429) {
      return reply
        .status(429)
        .send({ error: "rate_limited", message: "Слишком много запросов. Подождите минуту" });
    }
    if (status === 400) {
      return reply.status(400).send({ error: "bad_request", message: "Некорректный запрос" });
    }
    request.log.error(error);
    return reply.status(500).send({ error: "internal", message: "Внутренняя ошибка сервиса" });
  });

  app.get("/api/health", async () => ({ ok: true }));

  app.post<{ Body: RouteRequest }>(
    "/api/route",
    {
      config: { rateLimit: { max: deps.config.routeRateLimit, timeWindow: "1 minute" } },
      schema: {
        body: {
          type: "object",
          required: ["points"],
          additionalProperties: false,
          properties: {
            points: { type: "array", minItems: 2, items: pointSchema },
            roundTrip: { type: "boolean" },
            avoidUnpaved: { type: "boolean" },
          },
        },
      },
    },
    async (request): Promise<RouteResponse> => {
      const { points, roundTrip = false, avoidUnpaved = true } = request.body;
      const profile = avoidUnpaved ? "moto" : "moto_unpaved";
      const stops = roundTrip ? [...points, points[0] as LatLon] : points;
      const pairs = stops.slice(1).map((to, i) => [stops[i] as LatLon, to] as const);
      const key = (p: LatLon): string => `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`;

      const legs = await mapLimited(pairs, LEG_CONCURRENCY, async ([from, to]) => {
        const cacheKey = `${profile}|${key(from)}|${key(to)}`;
        const cached = legCache.get(cacheKey);
        if (cached) return cached;
        const leg = await deps.graphhopper.leg(from, to, profile);
        legCache.set(cacheKey, leg);
        return leg;
      });

      const zones: ZoneMark[] = [];
      let offsetKm = 0;
      for (const leg of legs) {
        for (const mark of zoneMarks(leg.fullGeometry, leg.fullKm, offsetKm)) {
          if (zones[zones.length - 1]?.timeZone !== mark.timeZone) zones.push(mark);
        }
        offsetKm += leg.distanceKm;
      }
      return {
        legs: legs.map(({ distanceKm, segments, geometry, geometryKm }) => ({
          distanceKm,
          segments,
          geometry,
          geometryKm,
        })),
        zones,
        distanceKm: offsetKm,
      };
    },
  );

  app.get<{ Querystring: { q: string; lat?: number; lon?: number } }>(
    "/api/geocode",
    {
      config: { rateLimit: { max: 120, timeWindow: "1 minute" } },
      schema: {
        querystring: {
          type: "object",
          required: ["q"],
          properties: {
            q: { type: "string", minLength: 2, maxLength: 200 },
            lat: { type: "number" },
            lon: { type: "number" },
          },
        },
      },
    },
    async (request) => {
      const { q, lat, lon } = request.query;
      const near = lat !== undefined && lon !== undefined ? { lat, lon } : undefined;
      return { places: await deps.geocoder.search(q, near) };
    },
  );

  app.get<{ Querystring: { lat: number; lon: number } }>(
    "/api/reverse",
    {
      config: { rateLimit: { max: 120, timeWindow: "1 minute" } },
      schema: {
        querystring: {
          type: "object",
          required: ["lat", "lon"],
          properties: { lat: { type: "number" }, lon: { type: "number" } },
        },
      },
    },
    async (request) => ({
      place: await deps.geocoder.reverse(request.query.lat, request.query.lon),
    }),
  );

  app.get<{ Querystring: { lat: number; lon: number; date: string } }>(
    "/api/weather",
    {
      config: { rateLimit: { max: 240, timeWindow: "1 minute" } },
      schema: {
        querystring: {
          type: "object",
          required: ["lat", "lon", "date"],
          properties: {
            lat: { type: "number", minimum: -90, maximum: 90 },
            lon: { type: "number", minimum: -180, maximum: 180 },
            date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
          },
        },
      },
    },
    async (request) => {
      if (!deps.weather)
        throw new UserFacingError("Погода не подключена", 503, "weather_unavailable");
      const { lat, lon, date } = request.query;
      return { weather: await deps.weather.day(lat, lon, date) };
    },
  );

  if (deps.config.tilesDir) {
    // PMTiles читается кусками через HTTP Range; @fastify/static поддерживает Range.
    app.register(fastifyStatic, {
      root: deps.config.tilesDir,
      prefix: "/tiles/",
      decorateReply: false,
      maxAge: "7d",
    });
  }

  if (deps.config.webDir) {
    app.register(fastifyStatic, { root: deps.config.webDir, redirect: true });
    // Одностраничное приложение: страницы без расширения отдают index.html, отсутствующие файлы дают 404.
    app.setNotFoundHandler((request, reply) => {
      const path = request.url.split(/[?#]/)[0] ?? "";
      if (path.startsWith("/api/")) {
        return reply.status(404).send({ error: "not_found", message: "Нет такого адреса API" });
      }
      if (request.method !== "GET" || /\.[a-z0-9]+$/i.test(path)) {
        return reply.status(404).send({ error: "not_found", message: "Файл не найден" });
      }
      return reply.sendFile("index.html");
    });
  }

  return app;
}
