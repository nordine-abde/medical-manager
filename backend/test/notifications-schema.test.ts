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
  taskId: string,
  patientId: string,
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
      values ($1, $2, $3, $4, 'pending')
    `,
    [taskId, patientId, "Seeded task", "follow_up"],
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
    [facilityId, "Central Clinic", "clinic", "Rome"],
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
      values ($1, $2, $3, $4, 'booked')
    `,
    [bookingId, patientId, taskId, facilityId],
  );
};

beforeEach(async () => {
  const schemaName = `test_notifications_${randomUUID().replaceAll("-", "")}`;
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
  await applyMigration(sql, schemaName, "0016_notifications.sql");
  await applyMigration(
    sql,
    schemaName,
    "0017_notification_delivery_tracking.sql",
  );

  await insertTestUser(sql, schemaName, "user-1");
  await insertPatient(
    sql,
    schemaName,
    "11111111-1111-4111-8111-111111111111",
    "user-1",
  );
  await insertTask(
    sql,
    schemaName,
    "22222222-2222-4222-8222-222222222222",
    "11111111-1111-4111-8111-111111111111",
  );
  await insertFacility(sql, schemaName, "33333333-3333-4333-8333-333333333333");
  await insertBooking(
    sql,
    schemaName,
    "44444444-4444-4444-8444-444444444444",
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222",
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

describe("notifications schema migration", () => {
  it("stores unique patient notification rules with telegram settings", async () => {
    const { schemaName, sql } = getTestContext();

    const [rule] = await sql.unsafe<
      Array<{
        days_before_due: number | null;
        enabled: boolean;
        patient_id: string;
        rule_type: string;
        telegram_chat_id: string | null;
        telegram_enabled: boolean;
      }>
    >(
      `
        insert into "${schemaName}"."notification_rules" (
          patient_id,
          rule_type,
          enabled,
          days_before_due,
          telegram_enabled,
          telegram_chat_id
        )
        values ($1, $2, $3, $4, $5, $6)
        returning
          patient_id,
          rule_type,
          enabled,
          days_before_due,
          telegram_enabled,
          telegram_chat_id
      `,
      [
        "11111111-1111-4111-8111-111111111111",
        "upcoming_booking",
        true,
        2,
        true,
        "-1234567890",
      ],
    );

    expect(rule).toEqual({
      days_before_due: 2,
      enabled: true,
      patient_id: "11111111-1111-4111-8111-111111111111",
      rule_type: "upcoming_booking",
      telegram_chat_id: "-1234567890",
      telegram_enabled: true,
    });

    try {
      await sql.unsafe(
        `
          insert into "${schemaName}"."notification_rules" (
            patient_id,
            rule_type
          )
          values ($1, $2)
        `,
        ["11111111-1111-4111-8111-111111111111", "upcoming_booking"],
      );

      throw new Error("Expected unique notification rule constraint error");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect(String(error)).toContain(
        "notification_rules_patient_id_rule_type_key",
      );
    }
  });

  it("rejects invalid notification rule lead times", async () => {
    const { schemaName, sql } = getTestContext();

    try {
      await sql.unsafe(
        `
          insert into "${schemaName}"."notification_rules" (
            patient_id,
            rule_type,
            days_before_due
          )
          values ($1, $2, $3)
        `,
        ["11111111-1111-4111-8111-111111111111", "overdue_task", -1],
      );

      throw new Error("Expected notification rule check constraint error");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect(String(error)).toContain(
        "notification_rules_days_before_due_check",
      );
    }
  });

  it("stores pending and delivered notification logs with workflow links", async () => {
    const { schemaName, sql } = getTestContext();

    const pendingRows = await sql.unsafe<
      Array<{
        booking_id: string | null;
        channel: string;
        external_message_id: string | null;
        patient_id: string | null;
        sent_at: Date | null;
        status: string;
        task_id: string | null;
      }>
    >(
      `
        insert into "${schemaName}"."notification_logs" (
          patient_id,
          task_id,
          channel,
          destination,
          message_body,
          status
        )
        values ($1, $2, 'telegram', $3, $4, 'pending')
        returning
          patient_id,
          task_id,
          booking_id,
          channel,
          status,
          sent_at,
          external_message_id
      `,
      [
        "11111111-1111-4111-8111-111111111111",
        "22222222-2222-4222-8222-222222222222",
        "-1234567890",
        "Task reminder",
      ],
    );

    expect(pendingRows[0]).toEqual({
      booking_id: null,
      channel: "telegram",
      external_message_id: null,
      patient_id: "11111111-1111-4111-8111-111111111111",
      sent_at: null,
      status: "pending",
      task_id: "22222222-2222-4222-8222-222222222222",
    });

    const deliveredRows = await sql.unsafe<
      Array<{
        booking_id: string | null;
        error_message: string | null;
        external_message_id: string | null;
        sent_at: Date | null;
        status: string;
      }>
    >(
      `
        insert into "${schemaName}"."notification_logs" (
          patient_id,
          booking_id,
          channel,
          destination,
          message_body,
          status,
          sent_at,
          error_message,
          external_message_id
        )
        values ($1, $2, 'telegram', $3, $4, 'failed', now(), $5, $6)
        returning booking_id, status, sent_at, error_message, external_message_id
      `,
      [
        "11111111-1111-4111-8111-111111111111",
        "44444444-4444-4444-8444-444444444444",
        "-1234567890",
        "Booking reminder",
        "Telegram bot blocked",
        "telegram-message-1",
      ],
    );

    const deliveredLog = deliveredRows[0];

    expect(deliveredLog).toBeDefined();

    expect(deliveredLog?.booking_id).toBe(
      "44444444-4444-4444-8444-444444444444",
    );
    expect(deliveredLog?.status).toBe("failed");
    expect(deliveredLog?.sent_at).not.toBeNull();
    expect(deliveredLog?.error_message).toBe("Telegram bot blocked");
    expect(deliveredLog?.external_message_id).toBe("telegram-message-1");
  });

  it("rejects delivery logs whose sent timestamp does not match status", async () => {
    const { schemaName, sql } = getTestContext();

    try {
      await sql.unsafe(
        `
          insert into "${schemaName}"."notification_logs" (
            patient_id,
            channel,
            destination,
            message_body,
            status,
            sent_at
          )
          values ($1, 'telegram', $2, $3, 'pending', now())
        `,
        [
          "11111111-1111-4111-8111-111111111111",
          "-1234567890",
          "Pending reminder",
        ],
      );

      throw new Error(
        "Expected notification log pending timestamp constraint error",
      );
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect(String(error)).toContain(
        "notification_logs_delivery_timestamp_check",
      );
    }

    try {
      await sql.unsafe(
        `
          insert into "${schemaName}"."notification_logs" (
            patient_id,
            channel,
            destination,
            message_body,
            status
          )
          values ($1, 'telegram', $2, $3, 'sent')
        `,
        [
          "11111111-1111-4111-8111-111111111111",
          "-1234567890",
          "Delivered reminder",
        ],
      );

      throw new Error(
        "Expected notification log delivered timestamp constraint error",
      );
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect(String(error)).toContain(
        "notification_logs_delivery_timestamp_check",
      );
    }
  });
});
