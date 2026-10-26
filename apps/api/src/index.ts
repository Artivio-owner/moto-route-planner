import { loadConfig } from "./config.js";
import { createGraphHopperClient } from "./graphhopper.js";
import { createPhotonClient } from "./photon.js";
import { buildServer } from "./server.js";

const config = loadConfig();
const app = buildServer({
  config,
  graphhopper: createGraphHopperClient(config.graphhopperUrl, config.upstreamTimeoutMs),
  geocoder: createPhotonClient(config.photonUrl, 10000),
});

app.listen({ port: config.port, host: config.host }).catch((error: unknown) => {
  app.log.error(error);
  process.exit(1);
});
