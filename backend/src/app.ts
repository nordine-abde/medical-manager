import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import { auth } from "./auth";
import { appConfig } from "./config/env";
import { logger } from "./logging";
import { createApiModules } from "./modules";

const requestStartTimes = new WeakMap<Request, number>();

const getApiRequestMetadata = (request: Request) => {
  const url = new URL(request.url);

  return {
    method: request.method,
    path: url.pathname,
  };
};

const isApiRequest = (request: Request) =>
  new URL(request.url).pathname.startsWith(appConfig.apiPrefix);

const getResponseStatus = (status: number | string | undefined) =>
  typeof status === "number" ? status : 200;

export const createApp = (authInstance = auth, appLogger = logger) =>
  new Elysia({ name: appConfig.appName })
    .use(cors())
    .onRequest(({ request }) => {
      if (isApiRequest(request)) {
        requestStartTimes.set(request, performance.now());
      }
    })
    .onAfterHandle(({ request, set }) => {
      if (!isApiRequest(request)) {
        return;
      }

      const startedAt = requestStartTimes.get(request);
      const durationMs =
        startedAt === undefined
          ? undefined
          : Math.round(performance.now() - startedAt);

      appLogger.debug("api_request", {
        ...getApiRequestMetadata(request),
        durationMs,
        status: getResponseStatus(set.status),
      });
    })
    .get("/", () => ({
      name: appConfig.appName,
      status: "ok",
    }))
    .group(appConfig.apiPrefix, (api) =>
      api.use(createApiModules(authInstance)),
    )
    .onError(({ code, error, request, set }) => {
      appLogger.error("api_error", {
        ...getApiRequestMetadata(request),
        code,
        error,
        status: code === "VALIDATION" ? 400 : 500,
      });

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
