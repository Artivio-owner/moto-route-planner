export interface ApiConfig {
  port: number;
  host: string;
  graphhopperUrl: string;
  photonUrl: string;
  /** Тайм-аут запроса к движку, мс (ADR-0011: защита сервера, а не ограничение маршрута). */
  upstreamTimeoutMs: number;
  /** Запросов маршрута в минуту с одного адреса. */
  routeRateLimit: number;
  /** Каталог собранного веб-приложения; если задан, API отдаёт и его. */
  webDir?: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const config: ApiConfig = {
    port: Number(env.PORT ?? 8080),
    host: env.HOST ?? "0.0.0.0",
    graphhopperUrl: env.GRAPHHOPPER_URL ?? "http://localhost:8989",
    photonUrl: env.PHOTON_URL ?? "http://localhost:2322",
    upstreamTimeoutMs: Number(env.UPSTREAM_TIMEOUT_MS ?? 30000),
    routeRateLimit: Number(env.ROUTE_RATE_LIMIT ?? 60),
  };
  if (env.WEB_DIR) config.webDir = env.WEB_DIR;
  return config;
}
