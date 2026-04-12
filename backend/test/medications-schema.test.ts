import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import postgres from "postgres";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgres://postgres:postgres@localhost:5432/medical_manager";

const migrationDirectory = path.join(import.meta.dir, "../src/db/migrations");

type TestContext = {
  schemaName: string;
  sql: postgres.Sql;
};

let testContext: TestContext | null = null;

const getTestContext = (): TestContext => {
  if (!testContext) {
    throw new Error("Missing test context");
  }

  return testContext;
};

const applyMigration = async (
  sql: postgres.Sql,
  schemaName: string,
  fileName: string,
): Promise<void> => {
  const migrationSql = await readFile(
    path.join(migrationDirectory, fileName),
    "utf8",
  );

  await sql.begin(async (transaction) => {
    await transaction.unsafe(`create schema if not exists "${schemaName}"`);
    await transaction.unsafe(`set local search_path to "${schemaName}"`);
    await transaction.unsafe(migrationSql);
  });
};

const insertTestUser = async (
  sql: postgres.Sql,
  schemaName: string,
  userId: string,
): Promise<void> => {
  await sql.unsafe(
    `
      insert into "${schemaName}"."user" (
        id,
        name,
        email,
        "emailVerified",
        "createdAt",
        "updatedAt"
      )
      values ($1, $2, $3, true, now(), now())
    `,
    [userId, `User ${userId}`, `${userId}@example.com`],
  );
};

const insertPatient = async (
  sql: postgres.Sql,
  schemaName: string,
  patientId: string,
  userId: string,
): Promise<void> => {
  await sql.unsafe(
    `
      insert into "${schemaName}"."patients" (
        id,
        full_name,
        notes
      )
      values ($1, $2, $3)
    `,
    [patientId, `Patient ${patientId}`, "Seeded test patient"],
  );

  await sql.unsafe(
    `
      insert into "${schemaName}"."patient_users" (
        patient_id,
        user_id
      )
      values ($1, $2)
    `,
    [patientId, userId],
  );
};

const insertCondition = async (
  sql: postgres.Sql,
  schemaName: string,
  patientId: string,
  conditionId: string,
): Promise<void> => {
  await sql.unsafe(
    `
      insert into "${schemaName}"."conditions" (
        id,
        patient_id,
        name,
        active
      )
      values ($1, $2, $3, true)
    `,
    [conditionId, patientId, "Chronic condition"],
  );
};

beforeEach(async () => {
  const schemaName = `test_medications_${randomUUID().replaceAll("-", "")}`;
  const sql = postgres(databaseUrl, {
    max: 1,
    onnotice: () => {},
    ssl: false,
  });

  await applyMigration(sql, schemaName, "0001_initial_setup.sql");
  await applyMigration(sql, schemaName, "0002_better_auth_core.sql");
  await applyMigration(sql, schemaName, "0004_patient_access.sql");
  await applyMigration(sql, schemaName, "0005_conditions.sql");
  await applyMigration(sql, schemaName, "0006_medical_instructions.sql");
  await applyMigration(sql, schemaName, "0007_tasks.sql");
  await applyMigration(sql, schemaName, "0009_prescriptions.sql");
  await applyMigration(sql, schemaName, "0011_medications.sql");
  await insertTestUser(sql, schemaName, "user-1");
  await insertTestUser(sql, schemaName, "user-2");
  await insertPatient(
    sql,
    schemaName,
    "11111111-1111-4111-8111-111111111111",
    "user-1",
  );
  await insertPatient(
    sql,
    schemaName,
    "22222222-2222-4222-8222-222222222222",
    "user-2",
  );
  await insertCondition(
    sql,
    schemaName,
    "11111111-1111-4111-8111-111111111111",
    "33333333-3333-4333-8333-333333333333",
  );

  testContext = {
    schemaName,
    sql,
  };
});

afterEach(async () => {
  if (!testContext) {
    return;
  }

  const { schemaName, sql } = testContext;
  testContext = null;

  await sql.unsafe(`drop schema if exists "${schemaName}" cascade`);
  await sql.end({ timeout: 5 });
});

describe("medications schema migration", () => {
  it("creates medications and allows same-patient prescription links", async () => {
    const { schemaName, sql } = getTestContext();

    const [medication] = await sql.unsafe<Array<{ id: string }>>(
      `
        insert into "${schemaName}"."medications" (
          patient_id,
          condition_id,
          name,
          dosage,
          quantity,
          renewal_cadence,
          next_gp_contact_date,
          notes
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8)
        returning id
      `,
      [
        "11111111-1111-4111-8111-111111111111",
        "33333333-3333-4333-8333-333333333333",
        "Metformin",
        "500 mg",
        "60 tablets",
        "monthly",
        "2026-04-15",
        "Usually requested monthly",
      ],
    );

    expect(medication?.id).toBeDefined();
    if (!medication) {
      throw new Error("Expected medication insert to return an id");
    }

    const [prescription] = await sql.unsafe<Array<{ medication_id: string }>>(
      `
        insert into "${schemaName}"."prescriptions" (
          patient_id,
          medication_id,
          prescription_type,
          status
        )
        values ($1, $2, 'medication', 'needed')
        returning medication_id
      `,
      ["11111111-1111-4111-8111-111111111111", medication.id],
    );

    expect(prescription?.medication_id).toBe(medication.id);
  });

  it("rejects cross-patient prescription medication links", async () => {
    const { schemaName, sql } = getTestContext();

    const [medication] = await sql.unsafe<Array<{ id: string }>>(
      `
        insert into "${schemaName}"."medications" (
          patient_id,
          name,
          dosage,
          quantity
        )
        values ($1, $2, $3, $4)
        returning id
      `,
      [
        "11111111-1111-4111-8111-111111111111",
        "Metformin",
        "500 mg",
        "60 tablets",
      ],
    );

    expect(medication?.id).toBeDefined();
    if (!medication) {
      throw new Error("Expected medication insert to return an id");
    }

    let error: unknown;

    try {
      await sql.unsafe(
        `
          insert into "${schemaName}"."prescriptions" (
            patient_id,
            medication_id,
            prescription_type,
            status
          )
          values ($1, $2, 'medication', 'needed')
        `,
        ["22222222-2222-4222-8222-222222222222", medication.id],
      );
    } catch (caughtError) {
      error = caughtError;
    }

    expect(error).toBeDefined();
    expect(String(error)).toMatch(/foreign key/i);
  });
});
