import { describe, expect, it } from "bun:test";

import { createLogger } from "../src/logging/logger";

describe("logger", () => {
  it("suppresses debug logs above the debug level", () => {
    const debugLogs: string[] = [];
    const logger = createLogger("info", {
      debug: (line) => debugLogs.push(line),
      error: () => undefined,
      info: () => undefined,
    });

    logger.debug("api_request", {
      method: "GET",
      path: "/api/v1/health/",
    });

    expect(debugLogs).toEqual([]);
  });

  it("emits structured debug logs when the level is debug", () => {
    const debugLogs: string[] = [];
    const logger = createLogger("debug", {
      debug: (line) => debugLogs.push(line),
      error: () => undefined,
      info: () => undefined,
    });

    logger.debug("api_request", {
      method: "GET",
      path: "/api/v1/health/",
      status: 200,
    });

    expect(JSON.parse(debugLogs[0] ?? "{}")).toEqual({
      level: "debug",
      message: "api_request",
      method: "GET",
      path: "/api/v1/health/",
      status: 200,
    });
  });

  it("always emits error logs", () => {
    const errorLogs: string[] = [];
    const logger = createLogger("error", {
      debug: () => undefined,
      error: (line) => errorLogs.push(line),
      info: () => undefined,
    });

    logger.error("api_error", {
      error: new Error("Database unavailable"),
      method: "POST",
      path: "/api/v1/patients",
      status: 500,
    });

    const payload = JSON.parse(errorLogs[0] ?? "{}");

    expect(payload.level).toBe("error");
    expect(payload.message).toBe("api_error");
    expect(payload.method).toBe("POST");
    expect(payload.path).toBe("/api/v1/patients");
    expect(payload.status).toBe(500);
    expect(payload.error.message).toBe("Database unavailable");
  });

  it("emits error logs even when info and debug logs are suppressed", () => {
    const debugLogs: string[] = [];
    const errorLogs: string[] = [];
    const infoLogs: string[] = [];
    const logger = createLogger("error", {
      debug: (line) => debugLogs.push(line),
      error: (line) => errorLogs.push(line),
      info: (line) => infoLogs.push(line),
    });

    logger.debug("debug_message");
    logger.info("info_message");
    logger.error("error_message");

    expect(debugLogs).toEqual([]);
    expect(infoLogs).toEqual([]);
    expect(errorLogs).toHaveLength(1);
    expect(JSON.parse(errorLogs[0] ?? "{}")).toEqual({
      level: "error",
      message: "error_message",
    });
  });
});
