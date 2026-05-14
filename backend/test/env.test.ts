import { describe, expect, it } from "bun:test";

import {
  buildAppConfig,
  buildBetterAuthConfig,
  buildDatabaseConfig,
} from "../src/config/env";

describe("env configuration", () => {
  it("builds app config with defaults", () => {
    expect(buildAppConfig({})).toEqual({
      apiPrefix: "/api/v1",
      appName: "medical-manager-backend",
      host: "0.0.0.0",
      logLevel: "info",
      port: 3000,
    });
  });

  it("builds app config with a debug log level", () => {
    expect(
      buildAppConfig({
        LOG_LEVEL: "debug",
      }),
    ).toEqual({
      apiPrefix: "/api/v1",
      appName: "medical-manager-backend",
      host: "0.0.0.0",
      logLevel: "debug",
      port: 3000,
    });
  });

  it("rejects invalid log levels", () => {
    expect(() =>
      buildAppConfig({
        LOG_LEVEL: "verbose",
      }),
    ).toThrow("Invalid LOG_LEVEL value: verbose");
  });

  it("builds database config with defaults", () => {
    expect(buildDatabaseConfig({})).toEqual({
      maxConnections: 10,
      schema: "app",
      ssl: false,
      url: "postgres://postgres:postgres@localhost:5432/medical_manager",
    });
  });

  it("rejects invalid database booleans", () => {
    expect(() =>
      buildDatabaseConfig({
        DATABASE_SSL: "yes",
      }),
    ).toThrow("Invalid DATABASE_SSL value: yes");
  });

  it("builds Better Auth config with defaults", () => {
    expect(buildBetterAuthConfig({})).toEqual({
      baseUrl: "http://localhost:3000",
      secret: "better-auth-secret-for-local-development-only-1234",
    });
  });

});
