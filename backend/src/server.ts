import { app } from "./app";
import { appConfig } from "./config/env";
import { logger } from "./logging";

app.listen({
  hostname: appConfig.host,
  port: appConfig.port,
});

console.log(
  `${appConfig.appName} listening on http://${appConfig.host}:${appConfig.port}${appConfig.apiPrefix}`,
);

logger.info("log_level_active", {
  logLevel: appConfig.logLevel,
});
