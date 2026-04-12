import { app } from "./app";
import { appConfig } from "./config/env";

app.listen({
  hostname: appConfig.host,
  port: appConfig.port,
});

console.log(
  `${appConfig.appName} listening on http://${appConfig.host}:${appConfig.port}${appConfig.apiPrefix}`,
);
