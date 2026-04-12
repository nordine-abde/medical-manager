import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { Elysia } from "elysia";
import postgres from "postgres";

import { createPrescriptionsModule } from "../src/modules/prescriptions";
import { createPrescriptionsRepository } from "../src/modules/prescriptions/repository";
import { createPrescriptionsService } from "../src/modules/prescriptions/service";

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

type PrescriptionPayload = {
  prescription: {
    collectedAt: string | null;
    deletedAt: string | null;
    expirationDate: string | null;
    id: string;
    issueDate: string | null;
    medicationId: string | null;
    notes: string | null;
    patientId: string;
    prescriptionType: string;
    receivedAt: string | null;
    requestedAt: string | null;
    status: string;
    subtype: string | null;
    taskId: string | null;
  };
};

type PrescriptionListPayload = {
  prescriptions: Array<PrescriptionPayload["prescription"]>;
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
      values ($1, $2, $3, $4, 'pending')
    `,
    [taskId, patientId, "Seeded task", "prescription_request"],
  );
};

beforeEach(async () => {
  const schemaName = `test_prescriptions_${randomUUID().replaceAll("-", "")}`;
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
  await applyMigration(sql, schemaName, "0018_prescription_subtypes.sql");
  await applyMigration(sql, schemaName, "0019_prescription_subtype_data.sql");
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

  const repository = createPrescriptionsRepository(sql, schemaName);
  const service = createPrescriptionsService(repository);
  const app = new Elysia().group("/api/v1", (api) =>
    api.use(createPrescriptionsModule(createTestAuth(), service)),
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

describe("prescriptions module", () => {
  it("rejects unauthenticated prescription access", async () => {
    const response = await getTestContext().app.handle(
      new Request(
        "http://localhost/api/v1/patients/11111111-1111-4111-8111-111111111111/prescriptions",
      ),
    );
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload).toEqual({
      error: "unauthorized",
      message: "Authentication required.",
    });
  });

  it("creates, lists, gets, updates, and changes prescription status", async () => {
    const patientId = "11111111-1111-4111-8111-111111111111";
    const taskId = "33333333-3333-4333-8333-333333333333";

    const createResponse = await getTestContext().app.handle(
      new Request(
        `http://localhost/api/v1/patients/${patientId}/prescriptions`,
        {
          body: JSON.stringify({
            issueDate: "2026-03-21",
            notes: "  Needed for annual blood tests  ",
            prescriptionType: "exam",
            subtype: "Blood tests",
            taskId,
          }),
          headers: {
            "content-type": "application/json",
            "x-test-user-id": "user-1",
          },
          method: "POST",
        },
      ),
    );
    const createPayload = (await createResponse.json()) as PrescriptionPayload;
    const prescriptionId = createPayload.prescription.id;

    expect(createResponse.status).toBe(200);
    expect(createPayload.prescription).toMatchObject({
      issueDate: "2026-03-21",
      notes: "Needed for annual blood tests",
      patientId,
      prescriptionType: "exam",
      requestedAt: null,
      status: "needed",
      subtype: "Blood tests",
      taskId,
    });

    const listResponse = await getTestContext().app.handle(
      new Request(
        `http://localhost/api/v1/patients/${patientId}/prescriptions`,
        {
          headers: {
            "x-test-user-id": "user-1",
          },
        },
      ),
    );
    const listPayload = (await listResponse.json()) as PrescriptionListPayload;

    expect(listResponse.status).toBe(200);
    expect(listPayload.prescriptions).toHaveLength(1);
    expect(listPayload.prescriptions[0]?.id).toBe(prescriptionId);

    const getResponse = await getTestContext().app.handle(
      new Request(`http://localhost/api/v1/prescriptions/${prescriptionId}`, {
        headers: {
          "x-test-user-id": "user-1",
        },
      }),
    );
    const getPayload = (await getResponse.json()) as PrescriptionPayload;

    expect(getResponse.status).toBe(200);
    expect(getPayload.prescription.taskId).toBe(taskId);

    const updateResponse = await getTestContext().app.handle(
      new Request(`http://localhost/api/v1/prescriptions/${prescriptionId}`, {
        body: JSON.stringify({
          expirationDate: "2026-05-01",
          medicationId: "55555555-5555-4555-8555-555555555555",
          notes: " Ready to request from GP ",
          prescriptionType: "medication",
          requestedAt: "2026-03-22T09:00:00.000Z",
          subtype: "Tachipirina",
          taskId: null,
        }),
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "user-1",
        },
        method: "PATCH",
      }),
    );
    const updatePayload = (await updateResponse.json()) as PrescriptionPayload;

    expect(updateResponse.status).toBe(200);
    expect(updatePayload.prescription).toMatchObject({
      expirationDate: "2026-05-01",
      medicationId: "55555555-5555-4555-8555-555555555555",
      notes: "Ready to request from GP",
      prescriptionType: "medication",
      requestedAt: "2026-03-22T09:00:00.000Z",
      subtype: "Tachipirina",
      taskId: null,
    });

    const requestedResponse = await getTestContext().app.handle(
      new Request(
        `http://localhost/api/v1/prescriptions/${prescriptionId}/status`,
        {
          body: JSON.stringify({
            status: "requested",
          }),
          headers: {
            "content-type": "application/json",
            "x-test-user-id": "user-1",
          },
          method: "PATCH",
        },
      ),
    );
    const requestedPayload =
      (await requestedResponse.json()) as PrescriptionPayload;

    expect(requestedResponse.status).toBe(200);
    expect(requestedPayload.prescription.status).toBe("requested");
    expect(requestedPayload.prescription.requestedAt).not.toBeNull();
    expect(requestedPayload.prescription.receivedAt).toBeNull();

    const availableResponse = await getTestContext().app.handle(
      new Request(
        `http://localhost/api/v1/prescriptions/${prescriptionId}/status`,
        {
          body: JSON.stringify({
            receivedAt: "2026-03-24T11:30:00.000Z",
            status: "available",
          }),
          headers: {
            "content-type": "application/json",
            "x-test-user-id": "user-1",
          },
          method: "PATCH",
        },
      ),
    );
    const availablePayload =
      (await availableResponse.json()) as PrescriptionPayload;

    expect(availableResponse.status).toBe(200);
    expect(availablePayload.prescription).toMatchObject({
      receivedAt: "2026-03-24T11:30:00.000Z",
      status: "available",
    });

    const collectedResponse = await getTestContext().app.handle(
      new Request(
        `http://localhost/api/v1/prescriptions/${prescriptionId}/status`,
        {
          body: JSON.stringify({
            collectedAt: "2026-03-25T15:00:00.000Z",
            status: "collected",
          }),
          headers: {
            "content-type": "application/json",
            "x-test-user-id": "user-1",
          },
          method: "PATCH",
        },
      ),
    );
    const collectedPayload =
      (await collectedResponse.json()) as PrescriptionPayload;

    expect(collectedResponse.status).toBe(200);
    expect(collectedPayload.prescription).toMatchObject({
      collectedAt: "2026-03-25T15:00:00.000Z",
      receivedAt: "2026-03-24T11:30:00.000Z",
      status: "collected",
    });

    const filteredListResponse = await getTestContext().app.handle(
      new Request(
        `http://localhost/api/v1/patients/${patientId}/prescriptions?status=collected&prescriptionType=medication&medicationId=55555555-5555-4555-8555-555555555555`,
        {
          headers: {
            "x-test-user-id": "user-1",
          },
        },
      ),
    );
    const filteredListPayload =
      (await filteredListResponse.json()) as PrescriptionListPayload;

    expect(filteredListResponse.status).toBe(200);
    expect(filteredListPayload.prescriptions).toHaveLength(1);
    expect(filteredListPayload.prescriptions[0]?.id).toBe(prescriptionId);
  });

  it("rejects invalid prescription status transitions", async () => {
    const patientId = "11111111-1111-4111-8111-111111111111";
    const createResponse = await getTestContext().app.handle(
      new Request(
        `http://localhost/api/v1/patients/${patientId}/prescriptions`,
        {
          body: JSON.stringify({
            prescriptionType: "exam",
          }),
          headers: {
            "content-type": "application/json",
            "x-test-user-id": "user-1",
          },
          method: "POST",
        },
      ),
    );
    const createPayload = (await createResponse.json()) as PrescriptionPayload;

    const response = await getTestContext().app.handle(
      new Request(
        `http://localhost/api/v1/prescriptions/${createPayload.prescription.id}/status`,
        {
          body: JSON.stringify({
            status: "collected",
          }),
          headers: {
            "content-type": "application/json",
            "x-test-user-id": "user-1",
          },
          method: "PATCH",
        },
      ),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "invalid_prescription_status_transition",
      message: "Prescription status transition is not allowed.",
    });
  });

  it("accepts every supported prescription type and normalizes the legacy alias", async () => {
    const patientId = "11111111-1111-4111-8111-111111111111";

    const supportedTypes = [
      { expectedType: "exam", submittedType: "exam", subtype: "Urine test" },
      {
        expectedType: "visit",
        submittedType: "visit",
        subtype: "Diabetology",
      },
      {
        expectedType: "therapy",
        submittedType: "therapy",
        subtype: "Physiotherapy",
      },
      {
        expectedType: "medication",
        submittedType: "medication",
        subtype: "Oki",
      },
      {
        expectedType: "visit",
        submittedType: "specialist_visit",
        subtype: "Cardiology",
      },
    ] as const;

    for (const [index, prescriptionType] of supportedTypes.entries()) {
      const response = await getTestContext().app.handle(
        new Request(
          `http://localhost/api/v1/patients/${patientId}/prescriptions`,
          {
            body: JSON.stringify({
              notes: `Prescription ${index + 1}`,
              prescriptionType: prescriptionType.submittedType,
              subtype: prescriptionType.subtype,
            }),
            headers: {
              "content-type": "application/json",
              "x-test-user-id": "user-1",
            },
            method: "POST",
          },
        ),
      );
      const payload = (await response.json()) as PrescriptionPayload;

      expect(response.status).toBe(200);
      expect(payload.prescription.prescriptionType).toBe(
        prescriptionType.expectedType,
      );
      expect(payload.prescription.subtype).toBe(prescriptionType.subtype);
    }
  });

  it("rejects cross-patient task links and inaccessible prescriptions", async () => {
    const patientId = "11111111-1111-4111-8111-111111111111";

    const createResponse = await getTestContext().app.handle(
      new Request(
        `http://localhost/api/v1/patients/${patientId}/prescriptions`,
        {
          body: JSON.stringify({
            prescriptionType: "exam",
            taskId: "44444444-4444-4444-8444-444444444444",
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

    const getResponse = await getTestContext().app.handle(
      new Request(
        "http://localhost/api/v1/prescriptions/99999999-9999-4999-8999-999999999999",
        {
          headers: {
            "x-test-user-id": "user-1",
          },
        },
      ),
    );

    expect(getResponse.status).toBe(404);
    expect(await getResponse.json()).toEqual({
      error: "prescription_not_found",
      message: "Prescription not found.",
    });
  });
});
