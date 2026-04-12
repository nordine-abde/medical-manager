import { databaseConfig } from "../../config/env";

export const databaseSchemaName = databaseConfig.schema;

export const quoteIdentifier = (value: string): string => `"${value}"`;

export const qualifyTableName = (
  schemaName: string,
  tableName: string,
): string => `${quoteIdentifier(schemaName)}.${quoteIdentifier(tableName)}`;
