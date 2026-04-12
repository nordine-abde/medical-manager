import postgres, { type Sql } from "postgres";

import { databaseConfig } from "../config/env";

const DB_CLOSE_TIMEOUT_SECONDS = 5;

let sqlClient: Sql | null = null;

export const createSqlClient = (
  connectionString = databaseConfig.url,
  options?: Partial<postgres.Options<Record<string, postgres.PostgresType>>>,
) =>
  postgres(connectionString, {
    max: databaseConfig.maxConnections,
    onnotice: () => {},
    ssl: databaseConfig.ssl ? "require" : false,
    ...options,
  });

export const getSqlClient = (): Sql => {
  if (!sqlClient) {
    sqlClient = createSqlClient();
  }

  return sqlClient;
};

export const closeSqlClient = async (): Promise<void> => {
  if (!sqlClient) {
    return;
  }

  const client = sqlClient;
  sqlClient = null;

  await client.end({ timeout: DB_CLOSE_TIMEOUT_SECONDS });
};

export const verifyDatabaseConnection = async (
  client: Sql = getSqlClient(),
): Promise<void> => {
  await client`select 1`;
};
