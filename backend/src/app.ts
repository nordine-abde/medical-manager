import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import { auth } from "./auth";
import { appConfig } from "./config/env";
import { createApiModules } from "./modules";

export const createApp = (authInstance = auth) =>
  new Elysia({ name: appConfig.appName })
    .use(cors())
    .get("/", () => ({
      name: appConfig.appName,
      status: "ok",
    }))
    .group(appConfig.apiPrefix, (api) =>
      api.use(createApiModules(authInstance)),
    )
    .onError(({ code, error, set }) => {
      if (code === "VALIDATION") {
        set.status = 400;

        return {
          error: "validation_error",
          message: error.message,
        };
      }

      set.status = 500;

      return {
        error: "internal_server_error",
        message: "An unexpected error occurred.",
      };
    });

export const app = createApp();
