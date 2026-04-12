import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { Elysia } from "elysia";
import postgres from "postgres";

import { createMedicalInstructionsModule } from "../src/modules/instructions";
import { createMedicalInstructionsRepository } from "../src/modules/instructions/repository";
import { createMedicalInstructionsService } from "../src/modules/instructions/service";

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

type InstructionPayload = {
  instruction: {
    careEventId: string | null;
    createdByUserId: string;
    doctorName: string | null;
    id: string;
    instructionDate: string;
    originalNotes: string;
    patientId: string;
    specialty: string | null;
    status: string;
    targetTimingText: string | null;
  };
};

type InstructionListPayload = {
  instructions: Array<InstructionPayload["instruction"]>;
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
        task_type
      )
      values ($1, $2, $3, $4)
    `,
    [taskId, patientId, "Seeded task", "follow_up"],
  );
};

const insertCareEvent = async (
  sql: postgres.Sql,
  schemaName: string,
  patientId: string,
  careEventId: string,
  taskId: string,
): Promise<void> => {
  await sql.unsafe(
    `
      insert into "${schemaName}"."care_events" (
        id,
        patient_id,
        task_id,
        event_type,
        completed_at
      )
      values ($1, $2, $3, $4, $5)
    `,
    [careEventId, patientId, taskId, "exam", "2026-03-18T10:00:00.000Z"],
  );
};

beforeEach(async () => {
  const schemaName = `test_instructions_${randomUUID().replaceAll("-", "")}`;
  const sql = postgres(databaseUrl, {
    max: 1,
    onnotice: () => {},
    ssl: false,
  });

  await applyMigration(sql, schemaName, "0001_initial_setup.sql");
  await applyMigration(sql, schemaName, "0002_better_auth_core.sql");
  await applyMigration(sql, schemaName, "0004_patient_access.sql");
  await applyMigration(sql, schemaName, "0006_medical_instructions.sql");
  await applyMigration(sql, schemaName, "0007_tasks.sql");
  await applyMigration(sql, schemaName, "0010_bookings.sql");
  await applyMigration(sql, schemaName, "0015_care_events.sql");
  await applyMigration(
    sql,
    schemaName,
    "0017_instruction_care_event_links.sql",
  );
  await insertTestUser(sql, schemaName, "user-1");
  await insertTestUser(sql, schemaName, "user-2");
  await insertPatient(
    sql,
    schemaName,
    "11111111-1111-4111-8111-111111111111",
    "user-1",
  );

  const repository = createMedicalInstructionsRepository(sql, schemaName);
  const service = createMedicalInstructionsService(repository);
  const app = new Elysia().group("/api/v1", (api) =>
    api.use(createMedicalInstructionsModule(createTestAuth(), service)),
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

describe("medical instructions module", () => {
  it("rejects unauthenticated instruction access", async () => {
    const response = await getTestContext().app.handle(
      new Request(
        "http://localhost/api/v1/patients/11111111-1111-4111-8111-111111111111/instructions",
      ),
    );
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload).toEqual({
      error: "unauthorized",
      message: "Authentication required.",
    });
  });

  it("creates, lists, filters, gets, and updates patient-scoped instructions", async () => {
    const patientId = "11111111-1111-4111-8111-111111111111";
    const taskId = "22222222-2222-4222-8222-222222222222";
    const careEventId = "33333333-3333-4333-8333-333333333333";
    const originalNotes =
      "  Repeat blood tests in 6 months.\nDo not trim this.  ";

    await insertTask(
      getTestContext().sql,
      getTestContext().schemaName,
      patientId,
      taskId,
    );
    await insertCareEvent(
      getTestContext().sql,
      getTestContext().schemaName,
      patientId,
      careEventId,
      taskId,
    );

    const createResponse = await getTestContext().app.handle(
      new Request(
        `http://localhost/api/v1/patients/${patientId}/instructions`,
        {
          body: JSON.stringify({
            careEventId,
            doctorName: " Dr. Bianchi ",
            instructionDate: "2026-03-19",
            originalNotes,
            specialty: " Endocrinology ",
            targetTimingText: " in 6 months ",
          }),
          headers: {
            "content-type": "application/json",
            "x-test-user-id": "user-1",
          },
          method: "POST",
        },
      ),
    );
    const createPayload = (await createResponse.json()) as InstructionPayload;
    const instructionId = createPayload.instruction.id;

    expect(createResponse.status).toBe(200);
    expect(createPayload.instruction).toMatchObject({
      careEventId,
      createdByUserId: "user-1",
      doctorName: "Dr. Bianchi",
      instructionDate: "2026-03-19",
      originalNotes,
      patientId,
      specialty: "Endocrinology",
      status: "active",
      targetTimingText: "in 6 months",
    });

    await getTestContext().app.handle(
      new Request(
        `http://localhost/api/v1/patients/${patientId}/instructions`,
        {
          body: JSON.stringify({
            doctorName: "Dr. Verdi",
            instructionDate: "2026-06-10",
            originalNotes: "Follow-up completed",
            status: "fulfilled",
          }),
          headers: {
            "content-type": "application/json",
            "x-test-user-id": "user-1",
          },
          method: "POST",
        },
      ),
    );

    const listResponse = await getTestContext().app.handle(
      new Request(
        `http://localhost/api/v1/patients/${patientId}/instructions?status=active&from=2026-03-01&to=2026-03-31`,
        {
          headers: {
            "x-test-user-id": "user-1",
          },
        },
      ),
    );
    const listPayload = (await listResponse.json()) as InstructionListPayload;

    expect(listResponse.status).toBe(200);
    expect(listPayload.instructions).toHaveLength(1);
    expect(listPayload.instructions[0]?.id).toBe(instructionId);

    const getResponse = await getTestContext().app.handle(
      new Request(`http://localhost/api/v1/instructions/${instructionId}`, {
        headers: {
          "x-test-user-id": "user-1",
        },
      }),
    );
    const getPayload = (await getResponse.json()) as InstructionPayload;

    expect(getResponse.status).toBe(200);
    expect(getPayload.instruction.careEventId).toBe(careEventId);
    expect(getPayload.instruction.originalNotes).toBe(originalNotes);

    const updateResponse = await getTestContext().app.handle(
      new Request(`http://localhost/api/v1/instructions/${instructionId}`, {
        body: JSON.stringify({
          careEventId: null,
          status: "superseded",
          targetTimingText: null,
        }),
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "user-1",
        },
        method: "PATCH",
      }),
    );
    const updatePayload = (await updateResponse.json()) as InstructionPayload;

    expect(updateResponse.status).toBe(200);
    expect(updatePayload.instruction).toMatchObject({
      careEventId: null,
      id: instructionId,
      originalNotes,
      status: "superseded",
      targetTimingText: null,
    });
  });

  it("returns 404 for inaccessible patient or instruction resources", async () => {
    const patientId = "11111111-1111-4111-8111-111111111111";

    const unauthorizedListResponse = await getTestContext().app.handle(
      new Request(
        `http://localhost/api/v1/patients/${patientId}/instructions`,
        {
          headers: {
            "x-test-user-id": "user-2",
          },
        },
      ),
    );

    expect(unauthorizedListResponse.status).toBe(404);

    const createResponse = await getTestContext().app.handle(
      new Request(
        `http://localhost/api/v1/patients/${patientId}/instructions`,
        {
          body: JSON.stringify({
            instructionDate: "2026-03-19",
            originalNotes: "Access-controlled note",
          }),
          headers: {
            "content-type": "application/json",
            "x-test-user-id": "user-1",
          },
          method: "POST",
        },
      ),
    );
    const createPayload = (await createResponse.json()) as InstructionPayload;

    const unauthorizedGetResponse = await getTestContext().app.handle(
      new Request(
        `http://localhost/api/v1/instructions/${createPayload.instruction.id}`,
        {
          headers: {
            "x-test-user-id": "user-2",
          },
        },
      ),
    );
    const unauthorizedGetPayload = await unauthorizedGetResponse.json();

    expect(unauthorizedGetResponse.status).toBe(404);
    expect(unauthorizedGetPayload).toEqual({
      error: "instruction_not_found",
      message: "Instruction not found.",
    });
  });

  it("rejects cross-patient care event links on create and update", async () => {
    const patientId = "11111111-1111-4111-8111-111111111111";
    const otherPatientId = "22222222-2222-4222-8222-222222222222";
    const patientTaskId = "33333333-3333-4333-8333-333333333333";
    const otherTaskId = "44444444-4444-4444-8444-444444444444";
    const patientCareEventId = "55555555-5555-4555-8555-555555555555";
    const otherCareEventId = "66666666-6666-4666-8666-666666666666";

    await insertPatient(
      getTestContext().sql,
      getTestContext().schemaName,
      otherPatientId,
      "user-1",
    );
    await insertTask(
      getTestContext().sql,
      getTestContext().schemaName,
      patientId,
      patientTaskId,
    );
    await insertTask(
      getTestContext().sql,
      getTestContext().schemaName,
      otherPatientId,
      otherTaskId,
    );
    await insertCareEvent(
      getTestContext().sql,
      getTestContext().schemaName,
      patientId,
      patientCareEventId,
      patientTaskId,
    );
    await insertCareEvent(
      getTestContext().sql,
      getTestContext().schemaName,
      otherPatientId,
      otherCareEventId,
      otherTaskId,
    );

    const createResponse = await getTestContext().app.handle(
      new Request(
        `http://localhost/api/v1/patients/${patientId}/instructions`,
        {
          body: JSON.stringify({
            careEventId: otherCareEventId,
            instructionDate: "2026-03-19",
            originalNotes: "Cross-patient link",
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

    const validCreateResponse = await getTestContext().app.handle(
      new Request(
        `http://localhost/api/v1/patients/${patientId}/instructions`,
        {
          body: JSON.stringify({
            careEventId: patientCareEventId,
            instructionDate: "2026-03-19",
            originalNotes: "Valid linked instruction",
          }),
          headers: {
            "content-type": "application/json",
            "x-test-user-id": "user-1",
          },
          method: "POST",
        },
      ),
    );
    const validCreatePayload =
      (await validCreateResponse.json()) as InstructionPayload;

    const updateResponse = await getTestContext().app.handle(
      new Request(
        `http://localhost/api/v1/instructions/${validCreatePayload.instruction.id}`,
        {
          body: JSON.stringify({
            careEventId: otherCareEventId,
          }),
          headers: {
            "content-type": "application/json",
            "x-test-user-id": "user-1",
          },
          method: "PATCH",
        },
      ),
    );

    expect(updateResponse.status).toBe(404);
    expect(await updateResponse.json()).toEqual({
      error: "instruction_not_found",
      message: "Instruction not found.",
    });
  });
});
