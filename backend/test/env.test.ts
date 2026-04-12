import { describe, expect, it } from "bun:test";

import {
  buildAppConfig,
  buildBetterAuthConfig,
  buildDatabaseConfig,
  buildNotificationsConfig,
} from "../src/config/env";

describe("env configuration", () => {
  it("builds app config with defaults", () => {
    expect(buildAppConfig({})).toEqual({
      apiPrefix: "/api/v1",
      appName: "medical-manager-backend",
      host: "0.0.0.0",
      port: 3000,
    });
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

  it("builds notifications config with defaults", () => {
    expect(buildNotificationsConfig({})).toEqual({
      logRetentionDays: 90,
      telegramApiBaseUrl: "https://api.telegram.org",
      telegramBotToken: null,
    });
  });

  it("trims telegram notification configuration", () => {
    expect(
      buildNotificationsConfig({
        TELEGRAM_API_BASE_URL: "https://example.test///",
        TELEGRAM_BOT_TOKEN: "  test-token  ",
      }),
    ).toEqual({
      logRetentionDays: 90,
      telegramApiBaseUrl: "https://example.test",
      telegramBotToken: "test-token",
    });
  });

  it("rejects invalid notification retention values", () => {
    expect(() =>
      buildNotificationsConfig({
        NOTIFICATION_LOG_RETENTION_DAYS: "0",
      }),
    ).toThrow("Invalid NOTIFICATION_LOG_RETENTION_DAYS value: 0");
  });
});
