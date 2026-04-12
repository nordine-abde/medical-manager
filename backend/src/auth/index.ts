import type { BetterAuthOptions } from "better-auth";
import { betterAuth } from "better-auth";
import { Pool } from "pg";

import { betterAuthConfig, databaseConfig } from "../config/env";

const DEFAULT_TRUSTED_ORIGINS = [betterAuthConfig.baseUrl];

let authPool: Pool | null = null;

const assertSafeIdentifier = (value: string, label: string): string => {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    throw new Error(`Invalid ${label}: ${value}`);
  }

  return value;
};

const getSearchPath = (): string =>
  assertSafeIdentifier(databaseConfig.schema, "DATABASE_SCHEMA");

export const createAuthPool = () =>
  new Pool({
    connectionString: databaseConfig.url,
    max: databaseConfig.maxConnections,
    options: `-c search_path=${getSearchPath()}`,
    ssl: databaseConfig.ssl ? { rejectUnauthorized: false } : undefined,
  });

export const getAuthPool = (): Pool => {
  if (!authPool) {
    authPool = createAuthPool();
  }

  return authPool;
};

export const closeAuthPool = async (): Promise<void> => {
  if (!authPool) {
    return;
  }

  const pool = authPool;
  authPool = null;

  await pool.end();
};

export const createAuth = (options: Partial<BetterAuthOptions> = {}) =>
  betterAuth({
    ...options,
    appName: "Medical Manager",
    basePath: "/api/v1/auth",
    baseURL: options.baseURL ?? betterAuthConfig.baseUrl,
    secret: options.secret ?? betterAuthConfig.secret,
    trustedOrigins: options.trustedOrigins ?? DEFAULT_TRUSTED_ORIGINS,
    database: options.database ?? getAuthPool(),
    emailAndPassword: {
      enabled: true,
      ...options.emailAndPassword,
    },
    user: {
      ...options.user,
      additionalFields: {
        ...options.user?.additionalFields,
        preferredLanguage: {
          defaultValue: "en",
          fieldName: "preferred_language",
          type: "string",
        },
      },
    },
  });

export const auth = createAuth();
