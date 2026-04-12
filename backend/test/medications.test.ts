import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { Elysia } from "elysia";
import postgres from "postgres";

import { createMedicationsModule } from "../src/modules/medications";
import { createMedicationsRepository } from "../src/modules/medications/repository";
import { createMedicationsService } from "../src/modules/medications/service";

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

type MedicationPayload = {
  medication: {
    archived: boolean;
    conditionId: string | null;
    deletedAt: string | null;
    dosage: string;
    id: string;
    linkedPrescriptions: Array<{
      id: string;
      issueDate: string | null;
      patientId: string;
      prescriptionType: string;
      status: string;
    }>;
    name: string;
    nextGpContactDate: string | null;
    notes: string | null;
    patientId: string;
    prescribingDoctor: string | null;
    quantity: string;
    renewalTasks: Array<{
      autoRecurrenceEnabled: boolean;
      dueDate: string | null;
      id: string;
      recurrenceRule: string | null;
      scheduledAt: string | null;
      status: string;
      title: string;
    }>;
    renewalCadence: string | null;
  };
};

type MedicationListPayload = {
  medications: Array<MedicationPayload["medication"]>;
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
      getSession: async ({ headers }: { headers: Headers }) => {
        const userId = headers.get("x-test-user-id");

        if (!userId) {
          return null;
        }

        return {
          session: {
            id: `session-${userId}`,
          },
          user: {
            email: `${userId}@example.com`,
            id: userId,
            name: `User ${userId}`,
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

const insertCondition = async (
  sql: postgres.Sql,
  schemaName: string,
  conditionId: string,
  patientId: string,
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
    [conditionId, patientId, `Condition ${conditionId}`],
  );
};

const insertPrescription = async (
  sql: postgres.Sql,
  schemaName: string,
  input: {
    issueDate: string | null;
    medicationId: string;
    patientId: string;
    prescriptionId: string;
    status: string;
  },
): Promise<void> => {
  await sql.unsafe(
    `
      insert into "${schemaName}"."prescriptions" (
        id,
        patient_id,
        medication_id,
        prescription_type,
        issue_date,
        status
      )
      values ($1, $2, $3, 'medication', $4, $5)
    `,
    [
      input.prescriptionId,
      input.patientId,
      input.medicationId,
      input.issueDate,
      input.status,
    ],
  );
};

const insertTask = async (
  sql: postgres.Sql,
  schemaName: string,
  input: {
    autoRecurrenceEnabled?: boolean;
    dueDate?: string | null;
    medicationId: string;
    patientId: string;
    recurrenceRule?: string | null;
    scheduledAt?: string | null;
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
        medication_id,
        title,
        task_type,
        status,
        due_date,
        scheduled_at,
        auto_recurrence_enabled,
        recurrence_rule
      )
      values ($1, $2, $3, $4, 'medication_renewal', $5, $6, $7, $8, $9)
    `,
    [
      input.taskId,
      input.patientId,
      input.medicationId,
      input.title,
      input.status ?? "pending",
      input.dueDate ?? null,
      input.scheduledAt ?? null,
      input.autoRecurrenceEnabled ?? false,
      input.recurrenceRule ?? null,
    ],
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
  await applyMigration(sql, schemaName, "0012_medication_archiving.sql");
  await applyMigration(sql, schemaName, "0013_task_medication_links.sql");

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
    "33333333-3333-4333-8333-333333333333",
    "11111111-1111-4111-8111-111111111111",
  );
  await insertCondition(
    sql,
    schemaName,
    "44444444-4444-4444-8444-444444444444",
    "22222222-2222-4222-8222-222222222222",
  );

  const repository = createMedicationsRepository(sql, schemaName);
  const service = createMedicationsService(repository);
  const app = new Elysia().group("/api/v1", (api) =>
    api.use(createMedicationsModule(createTestAuth(), service)),
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

describe("medications module", () => {
  it("rejects unauthenticated medication access", async () => {
    const response = await getTestContext().app.handle(
      new Request(
        "http://localhost/api/v1/patients/11111111-1111-4111-8111-111111111111/medications",
      ),
    );
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload).toEqual({
      error: "unauthorized",
      message: "Authentication required.",
    });
  });

  it("creates, lists, gets, updates, and archives patient-scoped medications", async () => {
    const patientId = "11111111-1111-4111-8111-111111111111";
    const conditionId = "33333333-3333-4333-8333-333333333333";

    const createResponse = await getTestContext().app.handle(
      new Request(`http://localhost/api/v1/patients/${patientId}/medications`, {
        body: JSON.stringify({
          conditionId,
          dosage: "500 mg",
          name: "Metformin",
          nextGpContactDate: "2026-04-15",
          notes: "Usually requested monthly",
          prescribingDoctor: "Dr. Rossi",
          quantity: "60 tablets",
          renewalCadence: "monthly",
        }),
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "user-1",
        },
        method: "POST",
      }),
    );
    const createPayload = (await createResponse.json()) as MedicationPayload;
    const medicationId = createPayload.medication.id;

    expect(createResponse.status).toBe(200);
    expect(createPayload.medication).toMatchObject({
      archived: false,
      conditionId,
      dosage: "500 mg",
      linkedPrescriptions: [],
      name: "Metformin",
      nextGpContactDate: "2026-04-15",
      notes: "Usually requested monthly",
      patientId,
      prescribingDoctor: "Dr. Rossi",
      quantity: "60 tablets",
      renewalTasks: [],
      renewalCadence: "monthly",
    });

    await insertPrescription(
      getTestContext().sql,
      getTestContext().schemaName,
      {
        issueDate: "2026-04-10",
        medicationId,
        patientId,
        prescriptionId: "55555555-5555-4555-8555-555555555555",
        status: "requested",
      },
    );
    await insertPrescription(
      getTestContext().sql,
      getTestContext().schemaName,
      {
        issueDate: "2026-03-01",
        medicationId,
        patientId,
        prescriptionId: "66666666-6666-4666-8666-666666666666",
        status: "available",
      },
    );
    await insertTask(getTestContext().sql, getTestContext().schemaName, {
      autoRecurrenceEnabled: false,
      dueDate: "2026-04-15",
      medicationId,
      patientId,
      recurrenceRule: null,
      scheduledAt: null,
      status: "pending",
      taskId: "77777777-7777-4777-8777-777777777777",
      title: "Call GP for renewal",
    });
    await insertTask(getTestContext().sql, getTestContext().schemaName, {
      autoRecurrenceEnabled: true,
      dueDate: "2026-05-15",
      medicationId,
      patientId,
      recurrenceRule: "FREQ=MONTHLY",
      scheduledAt: "2026-05-15T09:00:00.000Z",
      status: "scheduled",
      taskId: "88888888-8888-4888-8888-888888888888",
      title: "Monthly renewal follow-up",
    });

    const listResponse = await getTestContext().app.handle(
      new Request(`http://localhost/api/v1/patients/${patientId}/medications`, {
        headers: {
          "x-test-user-id": "user-1",
        },
      }),
    );
    const listPayload = (await listResponse.json()) as MedicationListPayload;

    expect(listResponse.status).toBe(200);
    expect(listPayload.medications).toHaveLength(1);
    expect(
      listPayload.medications[0]?.linkedPrescriptions.map((item) => item.id),
    ).toEqual([
      "55555555-5555-4555-8555-555555555555",
      "66666666-6666-4666-8666-666666666666",
    ]);
    expect(listPayload.medications[0]?.renewalTasks).toMatchObject([
      {
        autoRecurrenceEnabled: false,
        dueDate: "2026-04-15",
        id: "77777777-7777-4777-8777-777777777777",
        recurrenceRule: null,
        scheduledAt: null,
        status: "pending",
        title: "Call GP for renewal",
      },
      {
        autoRecurrenceEnabled: true,
        dueDate: "2026-05-15",
        id: "88888888-8888-4888-8888-888888888888",
        recurrenceRule: "FREQ=MONTHLY",
        scheduledAt: "2026-05-15T09:00:00.000Z",
        status: "scheduled",
        title: "Monthly renewal follow-up",
      },
    ]);

    const getResponse = await getTestContext().app.handle(
      new Request(`http://localhost/api/v1/medications/${medicationId}`, {
        headers: {
          "x-test-user-id": "user-1",
        },
      }),
    );
    const getPayload = (await getResponse.json()) as MedicationPayload;

    expect(getResponse.status).toBe(200);
    expect(getPayload.medication.linkedPrescriptions).toHaveLength(2);
    expect(getPayload.medication.renewalTasks).toHaveLength(2);
    expect(getPayload.medication.linkedPrescriptions[0]).toMatchObject({
      id: "55555555-5555-4555-8555-555555555555",
      issueDate: "2026-04-10",
      patientId,
      prescriptionType: "medication",
      status: "requested",
    });
    expect(getPayload.medication.renewalTasks[0]).toMatchObject({
      dueDate: "2026-04-15",
      id: "77777777-7777-4777-8777-777777777777",
      status: "pending",
      title: "Call GP for renewal",
    });

    const updateResponse = await getTestContext().app.handle(
      new Request(`http://localhost/api/v1/medications/${medicationId}`, {
        body: JSON.stringify({
          conditionId: null,
          dosage: "850 mg",
          nextGpContactDate: "2026-05-01",
          notes: "Updated monthly plan",
          quantity: "90 tablets",
        }),
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "user-1",
        },
        method: "PATCH",
      }),
    );
    const updatePayload = (await updateResponse.json()) as MedicationPayload;

    expect(updateResponse.status).toBe(200);
    expect(updatePayload.medication).toMatchObject({
      conditionId: null,
      dosage: "850 mg",
      nextGpContactDate: "2026-05-01",
      notes: "Updated monthly plan",
      quantity: "90 tablets",
    });
    expect(updatePayload.medication.linkedPrescriptions).toHaveLength(2);

    const archiveResponse = await getTestContext().app.handle(
      new Request(`http://localhost/api/v1/medications/${medicationId}`, {
        headers: {
          "x-test-user-id": "user-1",
        },
        method: "DELETE",
      }),
    );
    const archivePayload = (await archiveResponse.json()) as MedicationPayload;

    expect(archiveResponse.status).toBe(200);
    expect(archivePayload.medication.archived).toBe(true);
    expect(archivePayload.medication.deletedAt).not.toBeNull();

    const defaultListResponse = await getTestContext().app.handle(
      new Request(`http://localhost/api/v1/patients/${patientId}/medications`, {
        headers: {
          "x-test-user-id": "user-1",
        },
      }),
    );
    const defaultListPayload =
      (await defaultListResponse.json()) as MedicationListPayload;

    expect(defaultListResponse.status).toBe(200);
    expect(defaultListPayload.medications).toHaveLength(0);

    const archivedListResponse = await getTestContext().app.handle(
      new Request(
        `http://localhost/api/v1/patients/${patientId}/medications?includeArchived=true`,
        {
          headers: {
            "x-test-user-id": "user-1",
          },
        },
      ),
    );
    const archivedListPayload =
      (await archivedListResponse.json()) as MedicationListPayload;

    expect(archivedListResponse.status).toBe(200);
    expect(archivedListPayload.medications).toHaveLength(1);
    expect(archivedListPayload.medications[0]?.id).toBe(medicationId);
    expect(archivedListPayload.medications[0]?.archived).toBe(true);
  });

  it("rejects inaccessible patients, cross-patient condition links, and inaccessible medication reads", async () => {
    const createResponse = await getTestContext().app.handle(
      new Request(
        "http://localhost/api/v1/patients/22222222-2222-4222-8222-222222222222/medications",
        {
          body: JSON.stringify({
            conditionId: null,
            dosage: "500 mg",
            name: "Metformin",
            quantity: "60 tablets",
          }),
          headers: {
            "content-type": "application/json",
            "x-test-user-id": "user-1",
          },
          method: "POST",
        },
      ),
    );

    expect(createResponse.status).toBe(404);
    expect(await createResponse.json()).toEqual({
      error: "patient_not_found",
      message: "Patient not found.",
    });

    const invalidLinkResponse = await getTestContext().app.handle(
      new Request(
        "http://localhost/api/v1/patients/11111111-1111-4111-8111-111111111111/medications",
        {
          body: JSON.stringify({
            conditionId: "44444444-4444-4444-8444-444444444444",
            dosage: "500 mg",
            name: "Metformin",
            quantity: "60 tablets",
          }),
          headers: {
            "content-type": "application/json",
            "x-test-user-id": "user-1",
          },
          method: "POST",
        },
      ),
    );

    expect(invalidLinkResponse.status).toBe(404);
    expect(await invalidLinkResponse.json()).toEqual({
      error: "patient_not_found",
      message: "Patient not found.",
    });

    const hiddenMedicationResponse = await getTestContext().app.handle(
      new Request(
        "http://localhost/api/v1/medications/77777777-7777-4777-8777-777777777777",
        {
          headers: {
            "x-test-user-id": "user-2",
          },
        },
      ),
    );

    expect(hiddenMedicationResponse.status).toBe(404);
    expect(await hiddenMedicationResponse.json()).toEqual({
      error: "medication_not_found",
      message: "Medication not found.",
    });
  });
});
