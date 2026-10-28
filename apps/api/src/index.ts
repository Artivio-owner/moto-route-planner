import { loadConfig } from "./config.js";
import { createGraphHopperClient } from "./graphhopper.js";
import { createPhotonClient } from "./photon.js";
import { loadPoiIndex } from "./pois.js";
import { buildServer } from "./server.js";
import { createWeatherClient } from "./weather.js";

const config = loadConfig();
const pois = loadPoiIndex(config.poiFile);
const app = buildServer({
  ...(pois ? { pois } : {}),
  config,
  graphhopper: createGraphHopperClient(config.graphhopperUrl, config.upstreamTimeoutMs),
  geocoder: createPhotonClient(config.photonUrl, 10000),
  weather: createWeatherClient(
    { forecast: config.openMeteoUrl, archive: config.openMeteoArchiveUrl },
    15000,
  ),
});

app.listen({ port: config.port, host: config.host }).catch((error: unknown) => {
  app.log.error(error);
  process.exit(1);
});
