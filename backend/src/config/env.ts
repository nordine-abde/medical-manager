import path from "node:path";

const DEFAULT_HOST = "0.0.0.0";
const DEFAULT_PORT = 3000;
const DEFAULT_APP_NAME = "medical-manager-backend";
const DEFAULT_API_PREFIX = "/api/v1";
const DEFAULT_LOG_LEVEL = "info";
const DEFAULT_DATABASE_URL =
  "postgres://postgres:postgres@localhost:5432/medical_manager";
const DEFAULT_DATABASE_SCHEMA = "app";
const DEFAULT_DATABASE_MAX_CONNECTIONS = 10;
const DEFAULT_BETTER_AUTH_SECRET =
  "better-auth-secret-for-local-development-only-1234";
const DEFAULT_DOCUMENTS_STORAGE_ROOT = path.resolve(
  process.cwd(),
  "../../medical-manager-data/documents",
);
const DEFAULT_NOTIFICATION_LOG_RETENTION_DAYS = 90;
const DEFAULT_TELEGRAM_API_BASE_URL = "https://api.telegram.org";

type EnvSource = Record<string, string | undefined>;
export type LogLevel = "debug" | "info" | "error";

const runtimeEnv: EnvSource =
  typeof Bun !== "undefined" ? Bun.env : process.env;

const parsePort = (value: string | undefined): number => {
  if (!value) {
    return DEFAULT_PORT;
  }

  const port = Number(value);

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid PORT value: ${value}`);
  }

  return port;
};

const parsePositiveInteger = (
  value: string | undefined,
  defaultValue: number,
  envName: string,
): number => {
  if (!value) {
    return defaultValue;
  }

  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw new Error(`Invalid ${envName} value: ${value}`);
  }

  return parsedValue;
};

const parseBoolean = (value: string | undefined, envName: string): boolean => {
  if (!value) {
    return false;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  throw new Error(`Invalid ${envName} value: ${value}`);
};

const parseLogLevel = (value: string | undefined): LogLevel => {
  if (!value) {
    return DEFAULT_LOG_LEVEL;
  }

  const normalizedValue = value.toLowerCase();

  if (
    normalizedValue === "debug" ||
    normalizedValue === "info" ||
    normalizedValue === "error"
  ) {
    return normalizedValue;
  }

  throw new Error(`Invalid LOG_LEVEL value: ${value}`);
};

export const buildAppConfig = (env: EnvSource) =>
  ({
    appName: env.APP_NAME ?? DEFAULT_APP_NAME,
    apiPrefix: env.API_PREFIX ?? DEFAULT_API_PREFIX,
    host: env.HOST ?? DEFAULT_HOST,
    logLevel: parseLogLevel(env.LOG_LEVEL),
    port: parsePort(env.PORT),
  }) as const;

export const buildDatabaseConfig = (env: EnvSource) =>
  ({
    maxConnections: parsePositiveInteger(
      env.DATABASE_MAX_CONNECTIONS,
      DEFAULT_DATABASE_MAX_CONNECTIONS,
      "DATABASE_MAX_CONNECTIONS",
    ),
    schema: env.DATABASE_SCHEMA ?? DEFAULT_DATABASE_SCHEMA,
    ssl: parseBoolean(env.DATABASE_SSL, "DATABASE_SSL"),
    url: env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
  }) as const;

export const buildBetterAuthConfig = (env: EnvSource) =>
  ({
    baseUrl: env.BETTER_AUTH_URL ?? "http://localhost:3000",
    secret: env.BETTER_AUTH_SECRET ?? DEFAULT_BETTER_AUTH_SECRET,
  }) as const;

export const buildDocumentsStorageConfig = (env: EnvSource) =>
  ({
    rootDirectory: env.DOCUMENTS_STORAGE_ROOT ?? DEFAULT_DOCUMENTS_STORAGE_ROOT,
  }) as const;

export const buildNotificationsConfig = (env: EnvSource) =>
  ({
    logRetentionDays: parsePositiveInteger(
      env.NOTIFICATION_LOG_RETENTION_DAYS,
      DEFAULT_NOTIFICATION_LOG_RETENTION_DAYS,
      "NOTIFICATION_LOG_RETENTION_DAYS",
    ),
    telegramApiBaseUrl: (
      env.TELEGRAM_API_BASE_URL ?? DEFAULT_TELEGRAM_API_BASE_URL
    ).replace(/\/+$/, ""),
    telegramBotToken: env.TELEGRAM_BOT_TOKEN?.trim() || null,
  }) as const;

export const appConfig = buildAppConfig(runtimeEnv);
export const databaseConfig = buildDatabaseConfig(runtimeEnv);
export const betterAuthConfig = buildBetterAuthConfig(runtimeEnv);
export const documentsStorageConfig = buildDocumentsStorageConfig(runtimeEnv);
export const notificationsConfig = buildNotificationsConfig(runtimeEnv);
