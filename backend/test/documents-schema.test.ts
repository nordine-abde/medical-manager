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

beforeEach(async () => {
  const schemaName = `test_documents_${randomUUID().replaceAll("-", "")}`;
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
  await applyMigration(sql, schemaName, "0010_bookings.sql");
  await applyMigration(sql, schemaName, "0011_medications.sql");
  await applyMigration(sql, schemaName, "0014_documents.sql");
  await insertTestUser(sql, schemaName, "user-1");
  await insertPatient(
    sql,
    schemaName,
    "11111111-1111-4111-8111-111111111111",
    "user-1",
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

describe("documents schema migration", () => {
  it("stores patient document metadata for a linked workflow entity", async () => {
    const { schemaName, sql } = getTestContext();

    const [instruction] = await sql.unsafe<Array<{ id: string }>>(
      `
        insert into "${schemaName}"."medical_instructions" (
          patient_id,
          instruction_date,
          original_notes,
          created_by_user_id
        )
        values ($1, $2, $3, $4)
        returning id
      `,
      [
        "11111111-1111-4111-8111-111111111111",
        "2026-03-19",
        "Bring this report to the follow-up visit",
        "user-1",
      ],
    );

    expect(instruction?.id).toBeDefined();
    if (!instruction) {
      throw new Error("Expected medical instruction insert to return an id");
    }

    const [document] = await sql.unsafe<
      Array<{
        document_type: string;
        original_filename: string;
        related_entity_type: string;
        related_entity_id: string;
        stored_filename: string;
        uploaded_by_user_id: string;
      }>
    >(
      `
        insert into "${schemaName}"."documents" (
          patient_id,
          related_entity_type,
          related_entity_id,
          stored_filename,
          original_filename,
          mime_type,
          file_size_bytes,
          document_type,
          uploaded_by_user_id,
          notes
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        returning
          document_type,
          original_filename,
          related_entity_type,
          related_entity_id,
          stored_filename,
          uploaded_by_user_id
      `,
      [
        "11111111-1111-4111-8111-111111111111",
        "medical_instruction",
        instruction.id,
        "2026/03/19/6fc2b852-report.pdf",
        "report.pdf",
        "application/pdf",
        2048,
        "exam_result",
        "user-1",
        "Uploaded after the GP visit",
      ],
    );

    expect(document).toEqual({
      document_type: "exam_result",
      original_filename: "report.pdf",
      related_entity_id: instruction.id,
      related_entity_type: "medical_instruction",
      stored_filename: "2026/03/19/6fc2b852-report.pdf",
      uploaded_by_user_id: "user-1",
    });
  });

  it("supports care-event references before the care-events table exists", async () => {
    const { schemaName, sql } = getTestContext();
    const careEventId = "44444444-4444-4444-8444-444444444444";

    const [document] = await sql.unsafe<
      Array<{ related_entity_type: string; related_entity_id: string }>
    >(
      `
        insert into "${schemaName}"."documents" (
          patient_id,
          related_entity_type,
          related_entity_id,
          stored_filename,
          original_filename,
          mime_type,
          file_size_bytes,
          document_type,
          uploaded_by_user_id
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        returning related_entity_type, related_entity_id
      `,
      [
        "11111111-1111-4111-8111-111111111111",
        "care_event",
        careEventId,
        "2026/03/19/care-event-summary.pdf",
        "care-event-summary.pdf",
        "application/pdf",
        1024,
        "visit_report",
        "user-1",
      ],
    );

    expect(document).toEqual({
      related_entity_id: careEventId,
      related_entity_type: "care_event",
    });
  });

  it("rejects empty file metadata and unknown uploaders", async () => {
    const { schemaName, sql } = getTestContext();

    let invalidSizeError: unknown;

    try {
      await sql.unsafe(
        `
          insert into "${schemaName}"."documents" (
            patient_id,
            related_entity_type,
            related_entity_id,
            stored_filename,
            original_filename,
            mime_type,
            file_size_bytes,
            document_type,
            uploaded_by_user_id
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `,
        [
          "11111111-1111-4111-8111-111111111111",
          "patient",
          "11111111-1111-4111-8111-111111111111",
          "2026/03/19/empty.pdf",
          "empty.pdf",
          "application/pdf",
          0,
          "general_attachment",
          "user-1",
        ],
      );
    } catch (error) {
      invalidSizeError = error;
    }

    expect(invalidSizeError).toBeDefined();
    expect(String(invalidSizeError)).toContain(
      "documents_file_size_bytes_check",
    );

    let missingUploaderError: unknown;

    try {
      await sql.unsafe(
        `
          insert into "${schemaName}"."documents" (
            patient_id,
            related_entity_type,
            related_entity_id,
            stored_filename,
            original_filename,
            mime_type,
            file_size_bytes,
            document_type,
            uploaded_by_user_id
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `,
        [
          "11111111-1111-4111-8111-111111111111",
          "patient",
          "11111111-1111-4111-8111-111111111111",
          "2026/03/19/missing-user.pdf",
          "missing-user.pdf",
          "application/pdf",
          512,
          "general_attachment",
          "missing-user",
        ],
      );
    } catch (error) {
      missingUploaderError = error;
    }

    expect(missingUploaderError).toBeDefined();
    expect(String(missingUploaderError)).toContain("uploaded_by_user_id");
  });
});
