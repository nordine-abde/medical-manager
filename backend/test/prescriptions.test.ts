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
  "postgres://postgres:postgres@localhost:55432/medical_manager";

const migrationDirectory = path.join(import.meta.dir, "../src/db/migrations");
const currentSchemaMigrations = [
  "0001_initial_setup.sql",
  "0002_better_auth_core.sql",
  "0003_user_profile_language.sql",
  "0004_patient_access.sql",
  "0005_conditions.sql",
  "0007_tasks.sql",
  "0008_task_dependencies.sql",
  "0009_prescriptions.sql",
  "0010_bookings.sql",
  "0011_medications.sql",
  "0012_medication_archiving.sql",
  "0013_task_medication_links.sql",
  "0014_documents.sql",
  "0015_care_events.sql",
  "0016_notifications.sql",
  "0017_notification_delivery_tracking.sql",
  "0018_prescription_subtypes.sql",
  "0019_prescription_subtype_data.sql",
  "0020_care_event_subtypes.sql",
  "0021_drop_notifications.sql",
  "0022_drop_tasks.sql",
  "0023_drop_medical_instructions.sql",
  "0024_drop_conditions.sql",
  "0025_drop_medications.sql",
  "0026_simplify_prescriptions.sql",
] as const;

type TestContext = {
  app: {
    handle: (request: Request) => Promise<Response>;
  };
  schemaName: string;
  sql: postgres.Sql;
};

type PrescriptionPayload = {
  prescription: {
    deletedAt: string | null;
    expirationDate: string | null;
    id: string;
    issueDate: string | null;
    notes: string | null;
    patientId: string;
    prescriptionType: string;
    subtype: string | null;
  };
};

type PrescriptionListPayload = {
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  prescriptions: Array<PrescriptionPayload["prescription"]>;
};

type PrescriptionSubtypesPayload = {
  subtypesByType: {
    exam: string[];
    medication: string[];
    therapy: string[];
    visit: string[];
  };
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

const insertPrescription = async (
  sql: postgres.Sql,
  schemaName: string,
  patientId: string,
  input: {
    issueDate: string;
    notes?: string | null;
    prescriptionType: "exam" | "medication" | "therapy" | "visit";
    subtype?: string | null;
  },
): Promise<string> => {
  const [prescription] = await sql.unsafe<Array<{ id: string }>>(
    `
      insert into "${schemaName}"."prescriptions" (
        patient_id,
        prescription_type,
        subtype,
        issue_date,
        notes
      )
      values ($1, $2, $3, $4, $5)
      returning id
    `,
    [
      patientId,
      input.prescriptionType,
      input.subtype ?? null,
      input.issueDate,
      input.notes ?? null,
    ],
  );

  if (!prescription) {
    throw new Error("Failed to insert prescription");
  }

  return prescription.id;
};

beforeEach(async () => {
  const schemaName = `test_prescriptions_${randomUUID().replaceAll("-", "")}`;
  const sql = postgres(databaseUrl, {
    max: 1,
    onnotice: () => {},
    ssl: false,
  });

  for (const migration of currentSchemaMigrations) {
    await applyMigration(sql, schemaName, migration);
  }

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

  it("creates, lists, gets, and updates prescriptions", async () => {
    const patientId = "11111111-1111-4111-8111-111111111111";

    const createResponse = await getTestContext().app.handle(
      new Request(
        `http://localhost/api/v1/patients/${patientId}/prescriptions`,
        {
          body: JSON.stringify({
            issueDate: "2026-03-21",
            notes: "  Needed for annual blood tests  ",
            prescriptionType: "exam",
            subtype: "Blood tests",
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
      subtype: "Blood tests",
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
    expect(listPayload.pagination).toMatchObject({
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });

    const getResponse = await getTestContext().app.handle(
      new Request(`http://localhost/api/v1/prescriptions/${prescriptionId}`, {
        headers: {
          "x-test-user-id": "user-1",
        },
      }),
    );
    const getPayload = (await getResponse.json()) as PrescriptionPayload;

    expect(getResponse.status).toBe(200);
    expect(getPayload.prescription.id).toBe(prescriptionId);

    const updateResponse = await getTestContext().app.handle(
      new Request(`http://localhost/api/v1/prescriptions/${prescriptionId}`, {
        body: JSON.stringify({
          expirationDate: "2026-05-01",
          notes: " Ready to request from GP ",
          prescriptionType: "exam",
          subtype: "Tachipirina",
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
      notes: "Ready to request from GP",
      prescriptionType: "exam",
      subtype: "Tachipirina",
    });

    const filteredListResponse = await getTestContext().app.handle(
      new Request(
        `http://localhost/api/v1/patients/${patientId}/prescriptions?prescriptionType=exam`,
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

    const deleteResponse = await getTestContext().app.handle(
      new Request(`http://localhost/api/v1/prescriptions/${prescriptionId}`, {
        headers: {
          "x-test-user-id": "user-1",
        },
        method: "DELETE",
      }),
    );
    const deletePayload = (await deleteResponse.json()) as PrescriptionPayload;

    expect(deleteResponse.status).toBe(200);
    expect(deletePayload.prescription.id).toBe(prescriptionId);
    expect(deletePayload.prescription.deletedAt).not.toBeNull();

    const activeListAfterDeleteResponse = await getTestContext().app.handle(
      new Request(
        `http://localhost/api/v1/patients/${patientId}/prescriptions`,
        {
          headers: {
            "x-test-user-id": "user-1",
          },
        },
      ),
    );
    const activeListAfterDeletePayload =
      (await activeListAfterDeleteResponse.json()) as PrescriptionListPayload;

    expect(activeListAfterDeleteResponse.status).toBe(200);
    expect(activeListAfterDeletePayload.pagination.total).toBe(0);
    expect(activeListAfterDeletePayload.prescriptions).toHaveLength(0);

    const archivedListResponse = await getTestContext().app.handle(
      new Request(
        `http://localhost/api/v1/patients/${patientId}/prescriptions?includeArchived=true`,
        {
          headers: {
            "x-test-user-id": "user-1",
          },
        },
      ),
    );
    const archivedListPayload =
      (await archivedListResponse.json()) as PrescriptionListPayload;

    expect(archivedListResponse.status).toBe(200);
    expect(archivedListPayload.pagination.total).toBe(1);
    expect(archivedListPayload.prescriptions[0]?.id).toBe(prescriptionId);
    expect(archivedListPayload.prescriptions[0]?.deletedAt).not.toBeNull();
  });

  it("lists prescriptions with pagination, filters, and subtype suggestions", async () => {
    const { app, schemaName, sql } = getTestContext();
    const patientId = "11111111-1111-4111-8111-111111111111";

    const bloodTestId = await insertPrescription(sql, schemaName, patientId, {
      issueDate: "2026-03-01",
      notes: "Routine controls",
      prescriptionType: "exam",
      subtype: "Blood test",
    });
    await insertPrescription(sql, schemaName, patientId, {
      issueDate: "2026-04-01",
      notes: "Cardio follow up",
      prescriptionType: "visit",
      subtype: "Cardiology",
    });
    await insertPrescription(sql, schemaName, patientId, {
      issueDate: "2026-02-01",
      notes: "Rehab cycle",
      prescriptionType: "therapy",
      subtype: "Physiotherapy",
    });

    const pagedResponse = await app.handle(
      new Request(
        `http://localhost/api/v1/patients/${patientId}/prescriptions?page=2&pageSize=1`,
        {
          headers: {
            "x-test-user-id": "user-1",
          },
        },
      ),
    );
    const pagedPayload =
      (await pagedResponse.json()) as PrescriptionListPayload;

    expect(pagedResponse.status).toBe(200);
    expect(pagedPayload.pagination).toEqual({
      page: 2,
      pageSize: 1,
      total: 3,
      totalPages: 3,
    });
    expect(pagedPayload.prescriptions[0]?.id).toBe(bloodTestId);

    const searchResponse = await app.handle(
      new Request(
        `http://localhost/api/v1/patients/${patientId}/prescriptions?search=cardio&from=2026-03-01&to=2026-04-30`,
        {
          headers: {
            "x-test-user-id": "user-1",
          },
        },
      ),
    );
    const searchPayload =
      (await searchResponse.json()) as PrescriptionListPayload;

    expect(searchResponse.status).toBe(200);
    expect(searchPayload.pagination.total).toBe(1);
    expect(searchPayload.prescriptions[0]?.subtype).toBe("Cardiology");

    const subtypesResponse = await app.handle(
      new Request(
        `http://localhost/api/v1/patients/${patientId}/prescription-subtypes`,
        {
          headers: {
            "x-test-user-id": "user-1",
          },
        },
      ),
    );
    const subtypesPayload =
      (await subtypesResponse.json()) as PrescriptionSubtypesPayload;

    expect(subtypesResponse.status).toBe(200);
    expect(subtypesPayload.subtypesByType).toMatchObject({
      exam: ["Blood test"],
      therapy: ["Physiotherapy"],
      visit: ["Cardiology"],
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

  it("rejects inaccessible patient and prescription access", async () => {
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
            "x-test-user-id": "user-2",
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
