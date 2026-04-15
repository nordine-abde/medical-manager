import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import { auth } from "./auth";
import { appConfig } from "./config/env";
import { logger } from "./logging";
import { createApiModules } from "./modules";

const requestStartTimes = new WeakMap<Request, number>();
const loggedRequests = new WeakSet<Request>();

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

const getRequestDurationMs = (request: Request): number | undefined => {
  const startedAt = requestStartTimes.get(request);

  if (startedAt === undefined) {
    return undefined;
  }

  return Math.round(performance.now() - startedAt);
};

const logApiRequest = (
  appLogger: typeof logger,
  request: Request,
  status: number,
) => {
  if (!isApiRequest(request) || loggedRequests.has(request)) {
    return;
  }

  loggedRequests.add(request);

  appLogger.debug("api_request", {
    ...getApiRequestMetadata(request),
    durationMs: getRequestDurationMs(request),
    status,
  });
};

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

      logApiRequest(appLogger, request, getResponseStatus(set.status));
    })
    .get("/", () => ({
      name: appConfig.appName,
      status: "ok",
    }))
    .group(appConfig.apiPrefix, (api) =>
      api.use(createApiModules(authInstance)),
    )
    .onError(({ code, error, request, set }) => {
      const responseStatus = code === "VALIDATION" ? 400 : 500;

      logApiRequest(appLogger, request, responseStatus);

      appLogger.error("api_error", {
        ...getApiRequestMetadata(request),
        code,
        error,
        status: responseStatus,
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
