export interface ApiConfig {
  port: number;
  host: string;
  graphhopperUrl: string;
  photonUrl: string;
  /** Тайм-аут запроса к движку, мс (ADR-0011: защита сервера, а не ограничение маршрута). */
  upstreamTimeoutMs: number;
  /** Запросов маршрута в минуту с одного адреса. */
  routeRateLimit: number;
  openMeteoUrl: string;
  openMeteoArchiveUrl: string;
  /** Каталог собранного веб-приложения; если задан, API отдаёт и его. */
  webDir?: string;
  /** Каталог с файлами PMTiles; отдаётся по адресу /tiles/ (ADR-0015). */
  tilesDir?: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const config: ApiConfig = {
    port: Number(env.PORT ?? 8080),
    host: env.HOST ?? "0.0.0.0",
    graphhopperUrl: env.GRAPHHOPPER_URL ?? "http://localhost:8989",
    photonUrl: env.PHOTON_URL ?? "http://localhost:2322",
    upstreamTimeoutMs: Number(env.UPSTREAM_TIMEOUT_MS ?? 30000),
    routeRateLimit: Number(env.ROUTE_RATE_LIMIT ?? 60),
    openMeteoUrl: env.OPEN_METEO_URL ?? "https://api.open-meteo.com/v1/forecast",
    openMeteoArchiveUrl:
      env.OPEN_METEO_ARCHIVE_URL ?? "https://archive-api.open-meteo.com/v1/archive",
  };
  if (env.WEB_DIR) config.webDir = env.WEB_DIR;
  if (env.TILES_DIR) config.tilesDir = env.TILES_DIR;
  return config;
}
