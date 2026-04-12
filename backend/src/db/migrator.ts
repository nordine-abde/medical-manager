import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import type { Sql } from "postgres";

import { databaseConfig } from "../config/env";
import { getSqlClient } from "./client";

const MIGRATION_FILE_PATTERN = /^\d+.*\.sql$/;
const MIGRATION_TRACKING_TABLE = "schema_migrations";

export type MigrationFile = {
  id: string;
  name: string;
  sql: string;
};

export const migrationDirectory = path.join(import.meta.dir, "migrations");

export const assertSafeIdentifier = (value: string, label: string): string => {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    throw new Error(`Invalid ${label}: ${value}`);
  }

  return value;
};

const quoteIdentifier = (value: string): string => `"${value}"`;

const getQualifiedMigrationTable = (): string => {
  const schemaName = assertSafeIdentifier(
    databaseConfig.schema,
    "DATABASE_SCHEMA",
  );

  return `${quoteIdentifier(schemaName)}.${quoteIdentifier(MIGRATION_TRACKING_TABLE)}`;
};

export const readMigrationFiles = async (
  directory = migrationDirectory,
): Promise<MigrationFile[]> => {
  const entries = await readdir(directory, {
    withFileTypes: true,
  });

  const fileNames = entries
    .filter(
      (entry) => entry.isFile() && MIGRATION_FILE_PATTERN.test(entry.name),
    )
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  return Promise.all(
    fileNames.map(async (fileName) => ({
      id: fileName.replace(/\.sql$/, ""),
      name: fileName,
      sql: await readFile(path.join(directory, fileName), "utf8"),
    })),
  );
};

const ensureMigrationState = async (client: Sql): Promise<void> => {
  const schemaName = assertSafeIdentifier(
    databaseConfig.schema,
    "DATABASE_SCHEMA",
  );
  const qualifiedTableName = getQualifiedMigrationTable();

  await client.unsafe(
    `create schema if not exists ${quoteIdentifier(schemaName)}`,
  );
  await client.unsafe(`
    create table if not exists ${qualifiedTableName} (
      id text primary key,
      name text not null,
      applied_at timestamptz not null default now()
    )
  `);
};

export const getAppliedMigrationIds = async (
  client: Sql,
): Promise<Set<string>> => {
  await ensureMigrationState(client);

  const qualifiedTableName = getQualifiedMigrationTable();
  const rows = await client.unsafe<Array<{ id: string }>>(
    `select id from ${qualifiedTableName} order by id asc`,
  );

  return new Set(rows.map((row) => row.id));
};

export const runMigrations = async (
  client: Sql = getSqlClient(),
): Promise<string[]> => {
  const migrations = await readMigrationFiles();
  const appliedMigrationIds = await getAppliedMigrationIds(client);
  const pendingMigrations = migrations.filter(
    (migration) => !appliedMigrationIds.has(migration.id),
  );

  if (pendingMigrations.length === 0) {
    return [];
  }

  const qualifiedTableName = getQualifiedMigrationTable();
  const schemaName = assertSafeIdentifier(
    databaseConfig.schema,
    "DATABASE_SCHEMA",
  );

  for (const migration of pendingMigrations) {
    await client.begin(async (transaction) => {
      await transaction.unsafe(
        `set local search_path to ${quoteIdentifier(schemaName)}`,
      );
      await transaction.unsafe(migration.sql);
      await transaction.unsafe(
        `insert into ${qualifiedTableName} (id, name) values ($1, $2)`,
        [migration.id, migration.name],
      );
    });
  }

  return pendingMigrations.map((migration) => migration.id);
};
