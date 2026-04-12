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

const insertTask = async (
  sql: postgres.Sql,
  schemaName: string,
  patientId: string,
  taskId: string,
): Promise<void> => {
  await sql.unsafe(
    `
      insert into "${schemaName}"."tasks" (
        id,
        patient_id,
        title,
        task_type,
        status
      )
      values ($1, $2, $3, $4, 'completed')
    `,
    [taskId, patientId, "Completed lab exam", "exam_execution"],
  );
};

const insertFacility = async (
  sql: postgres.Sql,
  schemaName: string,
  facilityId: string,
): Promise<void> => {
  await sql.unsafe(
    `
      insert into "${schemaName}"."facilities" (
        id,
        name,
        facility_type,
        city
      )
      values ($1, $2, $3, $4)
    `,
    [facilityId, "Central Lab", "lab", "Rome"],
  );
};

const insertBooking = async (
  sql: postgres.Sql,
  schemaName: string,
  bookingId: string,
  patientId: string,
  taskId: string,
  facilityId: string,
): Promise<void> => {
  await sql.unsafe(
    `
      insert into "${schemaName}"."bookings" (
        id,
        patient_id,
        task_id,
        facility_id,
        booking_status
      )
      values ($1, $2, $3, $4, 'completed')
    `,
    [bookingId, patientId, taskId, facilityId],
  );
};

beforeEach(async () => {
  const schemaName = `test_care_events_${randomUUID().replaceAll("-", "")}`;
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
  await applyMigration(sql, schemaName, "0014_documents.sql");
  await applyMigration(sql, schemaName, "0015_care_events.sql");
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
  await insertTask(
    sql,
    schemaName,
    "11111111-1111-4111-8111-111111111111",
    "33333333-3333-4333-8333-333333333333",
  );
  await insertTask(
    sql,
    schemaName,
    "22222222-2222-4222-8222-222222222222",
    "44444444-4444-4444-8444-444444444444",
  );
  await insertFacility(sql, schemaName, "55555555-5555-4555-8555-555555555555");
  await insertBooking(
    sql,
    schemaName,
    "66666666-6666-4666-8666-666666666666",
    "11111111-1111-4111-8111-111111111111",
    "33333333-3333-4333-8333-333333333333",
    "55555555-5555-4555-8555-555555555555",
  );
  await insertBooking(
    sql,
    schemaName,
    "77777777-7777-4777-8777-777777777777",
    "22222222-2222-4222-8222-222222222222",
    "44444444-4444-4444-8444-444444444444",
    "55555555-5555-4555-8555-555555555555",
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

describe("care events schema migration", () => {
  it("stores completed care events with provider and facility context", async () => {
    const { schemaName, sql } = getTestContext();

    const [careEvent] = await sql.unsafe<
      Array<{
        booking_id: string | null;
        event_type: string;
        facility_id: string | null;
        provider_name: string | null;
        task_id: string | null;
      }>
    >(
      `
        insert into "${schemaName}"."care_events" (
          patient_id,
          task_id,
          booking_id,
          facility_id,
          provider_name,
          event_type,
          completed_at,
          outcome_notes
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8)
        returning
          task_id,
          booking_id,
          facility_id,
          provider_name,
          event_type
      `,
      [
        "11111111-1111-4111-8111-111111111111",
        "33333333-3333-4333-8333-333333333333",
        "66666666-6666-4666-8666-666666666666",
        "55555555-5555-4555-8555-555555555555",
        "Dr. Rossi",
        "exam",
        "2026-03-19T08:20:00Z",
        "Blood test completed, waiting for report.",
      ],
    );

    expect(careEvent).toEqual({
      booking_id: "66666666-6666-4666-8666-666666666666",
      event_type: "exam",
      facility_id: "55555555-5555-4555-8555-555555555555",
      provider_name: "Dr. Rossi",
      task_id: "33333333-3333-4333-8333-333333333333",
    });
  });

  it("supports document metadata linked to a persisted care event", async () => {
    const { schemaName, sql } = getTestContext();

    const [careEvent] = await sql.unsafe<Array<{ id: string }>>(
      `
        insert into "${schemaName}"."care_events" (
          patient_id,
          event_type,
          completed_at,
          outcome_notes
        )
        values ($1, $2, $3, $4)
        returning id
      `,
      [
        "11111111-1111-4111-8111-111111111111",
        "specialist_visit",
        "2026-03-19T09:15:00Z",
        "Follow-up visit completed.",
      ],
    );

    expect(careEvent?.id).toBeDefined();
    if (!careEvent) {
      throw new Error("Expected care event insert to return an id");
    }

    const [document] = await sql.unsafe<
      Array<{ related_entity_id: string; related_entity_type: string }>
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
        careEvent.id,
        "2026/03/19/follow-up-summary.pdf",
        "follow-up-summary.pdf",
        "application/pdf",
        4096,
        "visit_report",
        "user-1",
      ],
    );

    expect(document).toEqual({
      related_entity_id: careEvent.id,
      related_entity_type: "care_event",
    });
  });

  it("rejects cross-patient task links", async () => {
    const { schemaName, sql } = getTestContext();

    let error: unknown;

    try {
      await sql.unsafe(
        `
          insert into "${schemaName}"."care_events" (
            patient_id,
            task_id,
            event_type,
            completed_at
          )
          values ($1, $2, $3, $4)
        `,
        [
          "11111111-1111-4111-8111-111111111111",
          "44444444-4444-4444-8444-444444444444",
          "specialist_visit",
          "2026-03-19T10:00:00Z",
        ],
      );
    } catch (caughtError) {
      error = caughtError;
    }

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain(
      "care_events_patient_id_task_id_fkey",
    );
  });

  it("rejects cross-patient booking links", async () => {
    const { schemaName, sql } = getTestContext();

    let error: unknown;

    try {
      await sql.unsafe(
        `
          insert into "${schemaName}"."care_events" (
            patient_id,
            booking_id,
            event_type,
            completed_at
          )
          values ($1, $2, $3, $4)
        `,
        [
          "11111111-1111-4111-8111-111111111111",
          "77777777-7777-4777-8777-777777777777",
          "treatment",
          "2026-03-19T10:30:00Z",
        ],
      );
    } catch (caughtError) {
      error = caughtError;
    }

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain(
      "care_events_patient_id_booking_id_fkey",
    );
  });
});
