import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { Elysia } from "elysia";
import postgres from "postgres";

import { createNotificationsModule } from "../src/modules/notifications";
import { createNotificationsRepository } from "../src/modules/notifications/repository";
import { createNotificationsService } from "../src/modules/notifications/service";
import type { TelegramClient } from "../src/modules/notifications/telegram";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgres://postgres:postgres@localhost:5432/medical_manager";

const migrationDirectory = path.join(import.meta.dir, "../src/db/migrations");

type TestContext = {
  app: {
    handle: (request: Request) => Promise<Response>;
  };
  schemaName: string;
  sql: postgres.Sql;
};

type NotificationListPayload = {
  notifications: Array<{
    bookingId: string | null;
    channel: string;
    errorMessage?: string | null;
    externalMessageId?: string | null;
    destination: string;
    id: string;
    messageBody: string;
    patientId: string | null;
    sentAt?: string | null;
    status: string;
    taskId: string | null;
  }>;
};

type NotificationSettingsPayload = {
  settings: {
    medicationRenewal: {
      daysBeforeDue: number;
      enabled: boolean;
    };
    patientId: string;
    taskOverdue: {
      enabled: boolean;
    };
    telegramChatId: string;
    upcomingBooking: {
      daysBeforeDue: number;
      enabled: boolean;
    };
  };
};

type ScheduledJobsPayload = NotificationListPayload & {
  recurringTasks: Array<{
    sourceTaskId: string;
    taskId: string;
  }>;
};

let testContext: TestContext | null = null;

const getTestContext = (): TestContext => {
  if (!testContext) {
    throw new Error("Missing test context");
  }

  return testContext;
};

const createTestAuth = () =>
  ({
    api: {
      getSession: async ({
        headers,
      }: {
        headers: Headers | Record<string, string | undefined>;
      }) => {
        const getHeader = (name: string): string | null =>
          headers instanceof Headers
            ? headers.get(name)
            : (headers[name] ?? null);
        const resolvedUserId = getHeader("x-test-user-id");

        if (!resolvedUserId) {
          return null;
        }

        return {
          session: {
            id: `session-${resolvedUserId}`,
          },
          user: {
            email: `${resolvedUserId}@example.com`,
            id: resolvedUserId,
            name: `User ${resolvedUserId}`,
          },
        };
      },
    },
  }) as never;

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
  input: {
    dueDate?: string | null;
    patientId: string;
    status?: string;
    taskId: string;
    title: string;
  },
): Promise<void> => {
  await sql.unsafe(
    `
      insert into "${schemaName}"."tasks" (
        id,
        patient_id,
        title,
        task_type,
        status,
        due_date,
        auto_recurrence_enabled,
        recurrence_rule
      )
      values ($1, $2, $3, 'follow_up', $4, $5, false, null)
    `,
    [
      input.taskId,
      input.patientId,
      input.title,
      input.status ?? "pending",
      input.dueDate ?? null,
    ],
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
  input: {
    appointmentAt: string;
    bookingId: string;
    facilityId: string;
    patientId: string;
    taskId: string;
  },
): Promise<void> => {
  await sql.unsafe(
    `
      insert into "${schemaName}"."bookings" (
        id,
        patient_id,
        task_id,
        facility_id,
        booking_status,
        appointment_at
      )
      values ($1, $2, $3, $4, 'booked', $5)
    `,
    [
      input.bookingId,
      input.patientId,
      input.taskId,
      input.facilityId,
      input.appointmentAt,
    ],
  );
};

const insertMedication = async (
  sql: postgres.Sql,
  schemaName: string,
  input: {
    medicationId: string;
    name: string;
    nextGpContactDate: string;
    patientId: string;
  },
): Promise<void> => {
  await sql.unsafe(
    `
      insert into "${schemaName}"."medications" (
        id,
        patient_id,
        name,
        dosage,
        quantity,
        next_gp_contact_date
      )
      values ($1, $2, $3, '1 tablet', '30 tablets', $4)
    `,
    [input.medicationId, input.patientId, input.name, input.nextGpContactDate],
  );
};

const insertNotificationRule = async (
  sql: postgres.Sql,
  schemaName: string,
  input: {
    daysBeforeDue?: number | null;
    patientId: string;
    ruleType: string;
    telegramChatId: string;
  },
): Promise<void> => {
  await sql.unsafe(
    `
      insert into "${schemaName}"."notification_rules" (
        patient_id,
        rule_type,
        enabled,
        days_before_due,
        telegram_enabled,
        telegram_chat_id
      )
      values ($1, $2, true, $3, true, $4)
    `,
    [
      input.patientId,
      input.ruleType,
      input.daysBeforeDue ?? null,
      input.telegramChatId,
    ],
  );
};

const insertPendingNotificationLog = async (
  sql: postgres.Sql,
  schemaName: string,
  input: {
    bookingId?: string | null;
    destination: string;
    messageBody: string;
    patientId: string;
    taskId?: string | null;
  },
): Promise<string> => {
  const [row] = await sql.unsafe<Array<{ id: string }>>(
    `
      insert into "${schemaName}"."notification_logs" (
        patient_id,
        task_id,
        booking_id,
        channel,
        destination,
        message_body,
        status
      )
      values ($1, $2, $3, 'telegram', $4, $5, 'pending')
      returning id
    `,
    [
      input.patientId,
      input.taskId ?? null,
      input.bookingId ?? null,
      input.destination,
      input.messageBody,
    ],
  );

  if (!row) {
    throw new Error("Failed to insert notification log");
  }

  return row.id;
};

beforeEach(async () => {
  const schemaName = `test_notifications_module_${randomUUID().replaceAll("-", "")}`;
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
  await applyMigration(sql, schemaName, "0008_task_dependencies.sql");
  await applyMigration(sql, schemaName, "0009_prescriptions.sql");
  await applyMigration(sql, schemaName, "0010_bookings.sql");
  await applyMigration(sql, schemaName, "0011_medications.sql");
  await applyMigration(sql, schemaName, "0012_medication_archiving.sql");
  await applyMigration(sql, schemaName, "0013_task_medication_links.sql");
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

  const repository = createNotificationsRepository(sql, schemaName);
  const service = createNotificationsService(repository);
  const app = new Elysia().group("/api/v1", (api) =>
    api.use(createNotificationsModule(createTestAuth(), service)),
  );

  testContext = {
    app,
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

describe("notifications module", () => {
  it("loads default notification settings when no patient rules exist yet", async () => {
    const response = await getTestContext().app.handle(
      new Request(
        "http://localhost/api/v1/patients/11111111-1111-4111-8111-111111111111/notifications/settings",
        {
          headers: {
            "x-test-user-id": "user-1",
          },
          method: "GET",
        },
      ),
    );
    const payload = (await response.json()) as NotificationSettingsPayload;

    expect(response.status).toBe(200);
    expect(payload.settings).toEqual({
      medicationRenewal: {
        daysBeforeDue: 1,
        enabled: false,
      },
      patientId: "11111111-1111-4111-8111-111111111111",
      taskOverdue: {
        enabled: false,
      },
      telegramChatId: "",
      upcomingBooking: {
        daysBeforeDue: 2,
        enabled: false,
      },
    });
  });

  it("saves patient notification settings across all reminder rule types", async () => {
    const patientId = "11111111-1111-4111-8111-111111111111";

    const response = await getTestContext().app.handle(
      new Request(
        `http://localhost/api/v1/patients/${patientId}/notifications/settings`,
        {
          body: JSON.stringify({
            medicationRenewal: {
              daysBeforeDue: 1,
              enabled: true,
            },
            taskOverdue: {
              enabled: true,
            },
            telegramChatId: "-10077",
            upcomingBooking: {
              daysBeforeDue: 3,
              enabled: true,
            },
          }),
          headers: {
            "content-type": "application/json",
            "x-test-user-id": "user-1",
          },
          method: "PUT",
        },
      ),
    );
    const payload = (await response.json()) as NotificationSettingsPayload;

    expect(response.status).toBe(200);
    expect(payload.settings.telegramChatId).toBe("-10077");
    expect(payload.settings.taskOverdue.enabled).toBe(true);
    expect(payload.settings.upcomingBooking.daysBeforeDue).toBe(3);

    const storedRules = await getTestContext().sql.unsafe<
      Array<{
        days_before_due: number | null;
        enabled: boolean;
        rule_type: string;
        telegram_chat_id: string | null;
        telegram_enabled: boolean;
      }>
    >(
      `
        select
          rule_type,
          enabled,
          days_before_due,
          telegram_enabled,
          telegram_chat_id
        from "${getTestContext().schemaName}"."notification_rules"
        where patient_id = $1
        order by rule_type asc
      `,
      [patientId],
    );

    expect(storedRules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          days_before_due: 1,
          enabled: true,
          rule_type: "medication_renewal",
          telegram_chat_id: "-10077",
          telegram_enabled: true,
        }),
        expect.objectContaining({
          days_before_due: null,
          enabled: true,
          rule_type: "task_overdue",
          telegram_chat_id: "-10077",
          telegram_enabled: true,
        }),
        expect.objectContaining({
          days_before_due: 3,
          enabled: true,
          rule_type: "upcoming_booking",
          telegram_chat_id: "-10077",
          telegram_enabled: true,
        }),
      ]),
    );
  });

  it("generates pending reminders for overdue tasks, upcoming bookings, and medication renewals", async () => {
    const patientId = "11111111-1111-4111-8111-111111111111";
    const overdueTaskId = randomUUID();
    const bookingTaskId = randomUUID();
    const bookingId = randomUUID();
    const facilityId = randomUUID();
    const medicationId = randomUUID();

    await insertTask(getTestContext().sql, getTestContext().schemaName, {
      dueDate: "2026-03-19",
      patientId,
      taskId: overdueTaskId,
      title: "Review blood test results",
    });
    await insertTask(getTestContext().sql, getTestContext().schemaName, {
      patientId,
      taskId: bookingTaskId,
      title: "Attend cardiology visit",
    });
    await insertFacility(
      getTestContext().sql,
      getTestContext().schemaName,
      facilityId,
    );
    await insertBooking(getTestContext().sql, getTestContext().schemaName, {
      appointmentAt: "2026-03-23T09:30:00.000Z",
      bookingId,
      facilityId,
      patientId,
      taskId: bookingTaskId,
    });
    await insertMedication(getTestContext().sql, getTestContext().schemaName, {
      medicationId,
      name: "Metformin",
      nextGpContactDate: "2026-03-22",
      patientId,
    });

    await insertNotificationRule(
      getTestContext().sql,
      getTestContext().schemaName,
      {
        patientId,
        ruleType: "task_overdue",
        telegramChatId: "-1001",
      },
    );
    await insertNotificationRule(
      getTestContext().sql,
      getTestContext().schemaName,
      {
        daysBeforeDue: 2,
        patientId,
        ruleType: "upcoming_booking",
        telegramChatId: "-1001",
      },
    );
    await insertNotificationRule(
      getTestContext().sql,
      getTestContext().schemaName,
      {
        daysBeforeDue: 1,
        patientId,
        ruleType: "medication_renewal",
        telegramChatId: "-1001",
      },
    );

    const response = await getTestContext().app.handle(
      new Request("http://localhost/api/v1/notifications/reminders/generate", {
        body: JSON.stringify({
          referenceDate: "2026-03-21",
        }),
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "user-1",
        },
        method: "POST",
      }),
    );
    const payload = (await response.json()) as NotificationListPayload;

    expect(response.status).toBe(200);
    expect(payload.notifications).toHaveLength(3);
    expect(payload.notifications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          bookingId: null,
          destination: "-1001",
          patientId,
          status: "pending",
          taskId: overdueTaskId,
        }),
        expect.objectContaining({
          bookingId,
          destination: "-1001",
          patientId,
          status: "pending",
          taskId: bookingTaskId,
        }),
        expect.objectContaining({
          bookingId: null,
          destination: "-1001",
          patientId,
          status: "pending",
          taskId: null,
        }),
      ]),
    );

    const [storedLogs] = await getTestContext().sql.unsafe<
      Array<{ count: string }>
    >(
      `
        select count(*)::text as count
        from "${getTestContext().schemaName}"."notification_logs"
      `,
    );

    expect(storedLogs?.count).toBe("3");
  });

  it("keeps generation idempotent and ignores blocked overdue tasks", async () => {
    const patientId = "11111111-1111-4111-8111-111111111111";
    const prerequisiteTaskId = randomUUID();
    const blockedTaskId = randomUUID();

    await insertTask(getTestContext().sql, getTestContext().schemaName, {
      dueDate: "2026-03-18",
      patientId,
      taskId: prerequisiteTaskId,
      title: "Collect paperwork",
    });
    await insertTask(getTestContext().sql, getTestContext().schemaName, {
      dueDate: "2026-03-19",
      patientId,
      taskId: blockedTaskId,
      title: "Book specialist review",
    });
    await getTestContext().sql.unsafe(
      `
        insert into "${getTestContext().schemaName}"."task_dependencies" (
          task_id,
          depends_on_task_id
        )
        values ($1, $2)
      `,
      [blockedTaskId, prerequisiteTaskId],
    );
    await insertNotificationRule(
      getTestContext().sql,
      getTestContext().schemaName,
      {
        patientId,
        ruleType: "task_overdue",
        telegramChatId: "-1001",
      },
    );

    const firstResponse = await getTestContext().app.handle(
      new Request("http://localhost/api/v1/notifications/reminders/generate", {
        body: JSON.stringify({
          referenceDate: "2026-03-21",
        }),
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "user-1",
        },
        method: "POST",
      }),
    );
    const firstPayload =
      (await firstResponse.json()) as NotificationListPayload;

    expect(firstResponse.status).toBe(200);
    expect(firstPayload.notifications).toHaveLength(1);
    expect(firstPayload.notifications[0]?.taskId).toBe(prerequisiteTaskId);

    const secondResponse = await getTestContext().app.handle(
      new Request("http://localhost/api/v1/notifications/reminders/generate", {
        body: JSON.stringify({
          referenceDate: "2026-03-21",
        }),
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "user-1",
        },
        method: "POST",
      }),
    );
    const secondPayload =
      (await secondResponse.json()) as NotificationListPayload;

    expect(secondResponse.status).toBe(200);
    expect(secondPayload.notifications).toEqual([]);

    const [storedLogs] = await getTestContext().sql.unsafe<
      Array<{ count: string }>
    >(
      `
        select count(*)::text as count
        from "${getTestContext().schemaName}"."notification_logs"
      `,
    );

    expect(storedLogs?.count).toBe("1");
  });

  it("requires authentication for reminder generation", async () => {
    const response = await getTestContext().app.handle(
      new Request("http://localhost/api/v1/notifications/reminders/generate", {
        body: JSON.stringify({
          referenceDate: "2026-03-21",
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "unauthorized",
      message: "Authentication required.",
    });
  });

  it("delivers pending Telegram logs and marks them sent", async () => {
    const patientId = "11111111-1111-4111-8111-111111111111";
    const logId = await insertPendingNotificationLog(
      getTestContext().sql,
      getTestContext().schemaName,
      {
        destination: "-1001",
        messageBody: "Upcoming booking reminder",
        patientId,
      },
    );

    const telegramClient: TelegramClient = {
      sendMessage: async () => ({
        externalMessageId: "987654",
      }),
    };
    const repository = createNotificationsRepository(
      getTestContext().sql,
      getTestContext().schemaName,
    );
    const service = createNotificationsService(repository, telegramClient);
    const app = new Elysia().group("/api/v1", (api) =>
      api.use(createNotificationsModule(createTestAuth(), service)),
    );

    const response = await app.handle(
      new Request("http://localhost/api/v1/notifications/deliveries/process", {
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "user-1",
        },
        method: "POST",
      }),
    );
    const payload = (await response.json()) as NotificationListPayload;

    expect(response.status).toBe(200);
    expect(payload.notifications).toEqual([
      expect.objectContaining({
        destination: "-1001",
        externalMessageId: "987654",
        id: logId,
        status: "sent",
      }),
    ]);

    const [storedLog] = await getTestContext().sql.unsafe<
      Array<{
        external_message_id: string | null;
        sent_at: Date | null;
        status: string;
      }>
    >(
      `
        select status, sent_at, external_message_id
        from "${getTestContext().schemaName}"."notification_logs"
        where id = $1
      `,
      [logId],
    );

    expect(storedLog).toEqual(
      expect.objectContaining({
        external_message_id: "987654",
        status: "sent",
      }),
    );
    expect(storedLog?.sent_at).toBeInstanceOf(Date);
  });

  it("persists Telegram delivery failures on pending logs", async () => {
    const patientId = "11111111-1111-4111-8111-111111111111";
    const logId = await insertPendingNotificationLog(
      getTestContext().sql,
      getTestContext().schemaName,
      {
        destination: "-1002",
        messageBody: "Medication renewal reminder",
        patientId,
      },
    );

    const telegramClient: TelegramClient = {
      sendMessage: async () => {
        throw new Error("Telegram bot blocked");
      },
    };
    const repository = createNotificationsRepository(
      getTestContext().sql,
      getTestContext().schemaName,
    );
    const service = createNotificationsService(repository, telegramClient);
    const app = new Elysia().group("/api/v1", (api) =>
      api.use(createNotificationsModule(createTestAuth(), service)),
    );

    const response = await app.handle(
      new Request("http://localhost/api/v1/notifications/deliveries/process", {
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "user-1",
        },
        method: "POST",
      }),
    );
    const payload = (await response.json()) as NotificationListPayload;

    expect(response.status).toBe(200);
    expect(payload.notifications).toEqual([
      expect.objectContaining({
        errorMessage: "Telegram delivery failed.",
        externalMessageId: null,
        id: logId,
        status: "failed",
      }),
    ]);

    const [storedLog] = await getTestContext().sql.unsafe<
      Array<{
        error_message: string | null;
        sent_at: Date | null;
        status: string;
      }>
    >(
      `
        select status, sent_at, error_message
        from "${getTestContext().schemaName}"."notification_logs"
        where id = $1
      `,
      [logId],
    );

    expect(storedLog).toEqual(
      expect.objectContaining({
        error_message: "Telegram delivery failed.",
        status: "failed",
      }),
    );
    expect(storedLog?.sent_at).toBeInstanceOf(Date);
  });

  it("requires authentication for delivery processing", async () => {
    const response = await getTestContext().app.handle(
      new Request("http://localhost/api/v1/notifications/deliveries/process", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "unauthorized",
      message: "Authentication required.",
    });
  });

  it("runs reminder generation and recurring-task scheduling together", async () => {
    const patientId = "11111111-1111-4111-8111-111111111111";
    const recurringSourceTaskId = randomUUID();
    const medicationId = randomUUID();

    await getTestContext().sql.unsafe(
      `
        insert into "${getTestContext().schemaName}"."tasks" (
          id,
          patient_id,
          title,
          task_type,
          status,
          due_date,
          auto_recurrence_enabled,
          recurrence_rule,
          completed_at
        )
        values ($1, $2, $3, 'follow_up', 'completed', $4, true, 'monthly', $5)
      `,
      [
        recurringSourceTaskId,
        patientId,
        "Repeat bloodwork",
        "2026-03-20",
        "2026-03-20T08:00:00.000Z",
      ],
    );
    await insertMedication(getTestContext().sql, getTestContext().schemaName, {
      medicationId,
      name: "Metformin",
      nextGpContactDate: "2026-03-22",
      patientId,
    });
    await insertNotificationRule(
      getTestContext().sql,
      getTestContext().schemaName,
      {
        daysBeforeDue: 1,
        patientId,
        ruleType: "medication_renewal",
        telegramChatId: "-1001",
      },
    );

    const response = await getTestContext().app.handle(
      new Request("http://localhost/api/v1/notifications/jobs/run", {
        body: JSON.stringify({
          referenceDate: "2026-03-21",
        }),
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "user-1",
        },
        method: "POST",
      }),
    );
    const payload = (await response.json()) as ScheduledJobsPayload;

    expect(response.status).toBe(200);
    expect(payload.notifications).toHaveLength(1);
    expect(payload.notifications[0]).toEqual(
      expect.objectContaining({
        patientId,
        status: "pending",
        taskId: null,
      }),
    );
    expect(payload.recurringTasks).toHaveLength(1);
    expect(payload.recurringTasks[0]).toEqual(
      expect.objectContaining({
        sourceTaskId: recurringSourceTaskId,
      }),
    );
    const createdRecurringTaskId = payload.recurringTasks[0]?.taskId;

    expect(createdRecurringTaskId).toBeDefined();

    const [createdRecurringTask] = await getTestContext().sql.unsafe<
      Array<{
        auto_recurrence_enabled: boolean;
        due_date: Date | null;
        recurrence_rule: string | null;
        status: string;
        title: string;
      }>
    >(
      `
        select
          title,
          status,
          due_date,
          auto_recurrence_enabled,
          recurrence_rule
        from "${getTestContext().schemaName}"."tasks"
        where id = $1
      `,
      [createdRecurringTaskId as string],
    );

    expect(createdRecurringTask).toEqual(
      expect.objectContaining({
        auto_recurrence_enabled: true,
        recurrence_rule: "monthly",
        status: "pending",
        title: "Repeat bloodwork",
      }),
    );
    expect(createdRecurringTask?.due_date?.toISOString().slice(0, 10)).toBe(
      "2026-04-21",
    );
  });

  it("does not create recurring tasks when auto recurrence is disabled", async () => {
    const patientId = "11111111-1111-4111-8111-111111111111";

    await getTestContext().sql.unsafe(
      `
        insert into "${getTestContext().schemaName}"."tasks" (
          id,
          patient_id,
          title,
          task_type,
          status,
          due_date,
          auto_recurrence_enabled,
          recurrence_rule,
          completed_at
        )
        values ($1, $2, $3, 'follow_up', 'completed', $4, false, 'monthly', $5)
      `,
      [
        randomUUID(),
        patientId,
        "Manual repeat review",
        "2026-03-20",
        "2026-03-20T08:00:00.000Z",
      ],
    );

    const response = await getTestContext().app.handle(
      new Request("http://localhost/api/v1/notifications/jobs/run", {
        body: JSON.stringify({
          referenceDate: "2026-03-21",
        }),
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "user-1",
        },
        method: "POST",
      }),
    );
    const payload = (await response.json()) as ScheduledJobsPayload;

    expect(response.status).toBe(200);
    expect(payload.recurringTasks).toEqual([]);
  });

  it("keeps recurring scheduling idempotent for the same run window", async () => {
    const patientId = "11111111-1111-4111-8111-111111111111";
    const recurringSourceTaskId = randomUUID();

    await getTestContext().sql.unsafe(
      `
        insert into "${getTestContext().schemaName}"."tasks" (
          id,
          patient_id,
          title,
          task_type,
          status,
          due_date,
          auto_recurrence_enabled,
          recurrence_rule,
          completed_at
        )
        values ($1, $2, $3, 'follow_up', 'completed', $4, true, 'weekly', $5)
      `,
      [
        recurringSourceTaskId,
        patientId,
        "Weekly blood pressure check",
        "2026-03-20",
        "2026-03-20T08:00:00.000Z",
      ],
    );

    const firstResponse = await getTestContext().app.handle(
      new Request("http://localhost/api/v1/notifications/jobs/run", {
        body: JSON.stringify({
          referenceDate: "2026-03-21",
        }),
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "user-1",
        },
        method: "POST",
      }),
    );
    const firstPayload = (await firstResponse.json()) as ScheduledJobsPayload;

    const secondResponse = await getTestContext().app.handle(
      new Request("http://localhost/api/v1/notifications/jobs/run", {
        body: JSON.stringify({
          referenceDate: "2026-03-21",
        }),
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "user-1",
        },
        method: "POST",
      }),
    );
    const secondPayload = (await secondResponse.json()) as ScheduledJobsPayload;

    expect(firstResponse.status).toBe(200);
    expect(firstPayload.recurringTasks).toHaveLength(1);
    expect(secondResponse.status).toBe(200);
    expect(secondPayload.recurringTasks).toEqual([]);

    const [storedRecurringCount] = await getTestContext().sql.unsafe<
      Array<{ count: string }>
    >(
      `
        select count(*)::text as count
        from "${getTestContext().schemaName}"."tasks"
        where patient_id = $1
          and title = 'Weekly blood pressure check'
          and recurrence_rule = 'weekly'
      `,
      [patientId],
    );

    expect(storedRecurringCount?.count).toBe("2");
  });

  it("requires authentication for scheduled job runs", async () => {
    const response = await getTestContext().app.handle(
      new Request("http://localhost/api/v1/notifications/jobs/run", {
        body: JSON.stringify({
          referenceDate: "2026-03-21",
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "unauthorized",
      message: "Authentication required.",
    });
  });
});
