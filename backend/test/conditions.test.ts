import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { Elysia } from "elysia";
import postgres from "postgres";

import { createConditionsModule } from "../src/modules/conditions";
import { createConditionsRepository } from "../src/modules/conditions/repository";
import { createConditionsService } from "../src/modules/conditions/service";

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

type ConditionPayload = {
  condition: {
    active: boolean;
    id: string;
    name: string;
    notes: string | null;
    patientId: string;
  };
};

type ConditionListPayload = {
  conditions: Array<ConditionPayload["condition"]>;
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

beforeEach(async () => {
  const schemaName = `test_conditions_${randomUUID().replaceAll("-", "")}`;
  const sql = postgres(databaseUrl, {
    max: 1,
    onnotice: () => {},
    ssl: false,
  });

  await applyMigration(sql, schemaName, "0001_initial_setup.sql");
  await applyMigration(sql, schemaName, "0002_better_auth_core.sql");
  await applyMigration(sql, schemaName, "0004_patient_access.sql");
  await applyMigration(sql, schemaName, "0005_conditions.sql");
  await insertTestUser(sql, schemaName, "user-1");
  await insertTestUser(sql, schemaName, "user-2");
  await insertPatient(
    sql,
    schemaName,
    "11111111-1111-4111-8111-111111111111",
    "user-1",
  );

  const repository = createConditionsRepository(sql, schemaName);
  const service = createConditionsService(repository);
  const app = new Elysia().group("/api/v1", (api) =>
    api.use(createConditionsModule(createTestAuth(), service)),
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

describe("conditions module", () => {
  it("rejects unauthenticated condition access", async () => {
    const response = await getTestContext().app.handle(
      new Request(
        "http://localhost/api/v1/patients/11111111-1111-4111-8111-111111111111/conditions",
      ),
    );
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload).toEqual({
      error: "unauthorized",
      message: "Authentication required.",
    });
  });

  it("creates, lists, updates, and deactivates patient-scoped conditions", async () => {
    const patientId = "11111111-1111-4111-8111-111111111111";

    const createResponse = await getTestContext().app.handle(
      new Request(`http://localhost/api/v1/patients/${patientId}/conditions`, {
        body: JSON.stringify({
          name: "Diabetes",
          notes: "Type 2 diabetes follow-up",
        }),
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "user-1",
        },
        method: "POST",
      }),
    );
    const createPayload = (await createResponse.json()) as ConditionPayload;
    const conditionId = createPayload.condition.id;

    expect(createResponse.status).toBe(200);
    expect(createPayload.condition).toMatchObject({
      active: true,
      name: "Diabetes",
      notes: "Type 2 diabetes follow-up",
      patientId,
    });

    const listResponse = await getTestContext().app.handle(
      new Request(`http://localhost/api/v1/patients/${patientId}/conditions`, {
        headers: {
          "x-test-user-id": "user-1",
        },
      }),
    );
    const listPayload = (await listResponse.json()) as ConditionListPayload;

    expect(listResponse.status).toBe(200);
    expect(listPayload.conditions).toHaveLength(1);
    expect(listPayload.conditions[0]?.id).toBe(conditionId);

    const updateResponse = await getTestContext().app.handle(
      new Request(`http://localhost/api/v1/conditions/${conditionId}`, {
        body: JSON.stringify({
          active: false,
          name: "Type 2 Diabetes",
          notes: "Updated notes",
        }),
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "user-1",
        },
        method: "PATCH",
      }),
    );
    const updatePayload = (await updateResponse.json()) as ConditionPayload;

    expect(updateResponse.status).toBe(200);
    expect(updatePayload.condition).toMatchObject({
      active: false,
      name: "Type 2 Diabetes",
      notes: "Updated notes",
    });

    const activeOnlyListResponse = await getTestContext().app.handle(
      new Request(`http://localhost/api/v1/patients/${patientId}/conditions`, {
        headers: {
          "x-test-user-id": "user-1",
        },
      }),
    );
    const activeOnlyListPayload =
      (await activeOnlyListResponse.json()) as ConditionListPayload;

    expect(activeOnlyListResponse.status).toBe(200);
    expect(activeOnlyListPayload.conditions).toHaveLength(0);

    const includeInactiveResponse = await getTestContext().app.handle(
      new Request(
        `http://localhost/api/v1/patients/${patientId}/conditions?includeInactive=true`,
        {
          headers: {
            "x-test-user-id": "user-1",
          },
        },
      ),
    );
    const includeInactivePayload =
      (await includeInactiveResponse.json()) as ConditionListPayload;

    expect(includeInactiveResponse.status).toBe(200);
    expect(includeInactivePayload.conditions).toHaveLength(1);
    expect(includeInactivePayload.conditions[0]?.active).toBe(false);

    const deactivateResponse = await getTestContext().app.handle(
      new Request(`http://localhost/api/v1/conditions/${conditionId}`, {
        headers: {
          "x-test-user-id": "user-1",
        },
        method: "DELETE",
      }),
    );
    const deactivatePayload =
      (await deactivateResponse.json()) as ConditionPayload;

    expect(deactivateResponse.status).toBe(200);
    expect(deactivatePayload.condition.active).toBe(false);
  });

  it("returns 404 for inaccessible patient or condition resources", async () => {
    const patientId = "11111111-1111-4111-8111-111111111111";

    const unauthorizedListResponse = await getTestContext().app.handle(
      new Request(`http://localhost/api/v1/patients/${patientId}/conditions`, {
        headers: {
          "x-test-user-id": "user-2",
        },
      }),
    );

    expect(unauthorizedListResponse.status).toBe(404);

    const createResponse = await getTestContext().app.handle(
      new Request(`http://localhost/api/v1/patients/${patientId}/conditions`, {
        body: JSON.stringify({
          name: "Pituitary follow-up",
        }),
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "user-1",
        },
        method: "POST",
      }),
    );
    const createPayload = (await createResponse.json()) as ConditionPayload;

    const unauthorizedUpdateResponse = await getTestContext().app.handle(
      new Request(
        `http://localhost/api/v1/conditions/${createPayload.condition.id}`,
        {
          body: JSON.stringify({
            name: "Should not update",
          }),
          headers: {
            "content-type": "application/json",
            "x-test-user-id": "user-2",
          },
          method: "PATCH",
        },
      ),
    );
    const unauthorizedUpdatePayload = await unauthorizedUpdateResponse.json();

    expect(unauthorizedUpdateResponse.status).toBe(404);
    expect(unauthorizedUpdatePayload).toEqual({
      error: "condition_not_found",
      message: "Condition not found.",
    });
  });
});
