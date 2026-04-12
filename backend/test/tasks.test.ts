import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { Elysia } from "elysia";
import postgres from "postgres";

import { createTasksModule } from "../src/modules/tasks";
import { createTasksRepository } from "../src/modules/tasks/repository";
import { createTasksService } from "../src/modules/tasks/service";

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

type TaskPayload = {
  task: {
    autoRecurrenceEnabled: boolean;
    blockedByTaskIds: string[];
    completedAt: string | null;
    conditionId: string | null;
    deletedAt: string | null;
    description: string | null;
    dueDate: string | null;
    id: string;
    medicationId: string | null;
    medicalInstructionId: string | null;
    patientId: string;
    recurrenceRule: string | null;
    scheduledAt: string | null;
    status: string;
    taskType: string;
    title: string;
  };
};

type TaskListPayload = {
  tasks: Array<TaskPayload["task"]>;
};

type GlobalTaskListPayload = {
  tasks: Array<{
    patient: {
      fullName: string;
      id: string;
    };
    task: TaskPayload["task"];
  }>;
};

type TaskDependencyPayload = {
  dependency: {
    createdAt: string;
    dependsOnTaskId: string;
    id: string;
    taskId: string;
  };
};

type TaskDependencyListPayload = {
  dependencies: Array<TaskDependencyPayload["dependency"]>;
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
  patientId: string,
  conditionId: string,
): Promise<void> => {
  await sql.unsafe(
    `
      insert into "${schemaName}"."conditions" (
        id,
        patient_id,
        name,
        notes,
        active
      )
      values ($1, $2, $3, $4, true)
    `,
    [conditionId, patientId, "Type 2 diabetes", "Seeded condition"],
  );
};

const insertInstruction = async (
  sql: postgres.Sql,
  schemaName: string,
  patientId: string,
  userId: string,
  instructionId: string,
): Promise<void> => {
  await sql.unsafe(
    `
      insert into "${schemaName}"."medical_instructions" (
        id,
        patient_id,
        doctor_name,
        instruction_date,
        original_notes,
        status,
        created_by_user_id
      )
      values ($1, $2, $3, $4, $5, 'active', $6)
    `,
    [
      instructionId,
      patientId,
      "Dr. Test",
      "2026-03-19",
      "Seeded instruction",
      userId,
    ],
  );
};

const insertMedication = async (
  sql: postgres.Sql,
  schemaName: string,
  input: {
    medicationId: string;
    name: string;
    nextGpContactDate: string | null;
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

const insertTask = async (
  sql: postgres.Sql,
  schemaName: string,
  input: {
    completedAt?: string | null;
    dueDate?: string | null;
    patientId: string;
    scheduledAt?: string | null;
    status?: string;
    taskId: string;
    taskType?: string;
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
        scheduled_at,
        auto_recurrence_enabled,
        recurrence_rule,
        completed_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, false, null, $8)
    `,
    [
      input.taskId,
      input.patientId,
      input.title,
      input.taskType ?? "follow_up",
      input.status ?? "pending",
      input.dueDate ?? null,
      input.scheduledAt ?? null,
      input.completedAt ?? null,
    ],
  );
};

beforeEach(async () => {
  const schemaName = `test_tasks_${randomUUID().replaceAll("-", "")}`;
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
    "11111111-1111-4111-8111-111111111111",
    "33333333-3333-4333-8333-333333333333",
  );
  await insertCondition(
    sql,
    schemaName,
    "22222222-2222-4222-8222-222222222222",
    "44444444-4444-4444-8444-444444444444",
  );
  await insertInstruction(
    sql,
    schemaName,
    "11111111-1111-4111-8111-111111111111",
    "user-1",
    "55555555-5555-4555-8555-555555555555",
  );
  await insertInstruction(
    sql,
    schemaName,
    "22222222-2222-4222-8222-222222222222",
    "user-2",
    "66666666-6666-4666-8666-666666666666",
  );
  await insertMedication(sql, schemaName, {
    medicationId: "77777777-7777-4777-8777-777777777777",
    name: "Metformin",
    nextGpContactDate: "2026-04-15",
    patientId: "11111111-1111-4111-8111-111111111111",
  });
  await insertMedication(sql, schemaName, {
    medicationId: "88888888-8888-4888-8888-888888888888",
    name: "Insulin",
    nextGpContactDate: "2026-05-20",
    patientId: "22222222-2222-4222-8222-222222222222",
  });

  const repository = createTasksRepository(sql, schemaName);
  const service = createTasksService(repository);
  const app = new Elysia().group("/api/v1", (api) =>
    api.use(createTasksModule(createTestAuth(), service)),
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

describe("tasks module", () => {
  it("lists accessible global tasks with patient context and state filters", async () => {
    const sharedPatientId = "22222222-2222-4222-8222-222222222222";
    const ownedPatientId = "11111111-1111-4111-8111-111111111111";
    const pendingTaskId = randomUUID();
    const blockedPrerequisiteId = randomUUID();
    const blockedTaskId = randomUUID();
    const overdueTaskId = randomUUID();
    const upcomingTaskId = randomUUID();
    const completedTaskId = randomUUID();

    await getTestContext().sql.unsafe(
      `
        insert into "${getTestContext().schemaName}"."patient_users" (
          patient_id,
          user_id
        )
        values ($1, $2)
        on conflict do nothing
      `,
      [sharedPatientId, "user-1"],
    );

    await insertTask(getTestContext().sql, getTestContext().schemaName, {
      dueDate: "2099-06-01",
      patientId: ownedPatientId,
      taskId: pendingTaskId,
      title: "Confirm bloodwork slot",
    });
    await insertTask(getTestContext().sql, getTestContext().schemaName, {
      dueDate: "2099-06-03",
      patientId: ownedPatientId,
      taskId: blockedPrerequisiteId,
      title: "Receive GP note",
    });
    await insertTask(getTestContext().sql, getTestContext().schemaName, {
      dueDate: "2099-06-04",
      patientId: ownedPatientId,
      taskId: blockedTaskId,
      title: "Book follow-up visit",
    });
    await insertTask(getTestContext().sql, getTestContext().schemaName, {
      dueDate: "2000-01-05",
      patientId: sharedPatientId,
      taskId: overdueTaskId,
      title: "Call lab about missing report",
    });
    await insertTask(getTestContext().sql, getTestContext().schemaName, {
      dueDate: "2099-07-09",
      patientId: sharedPatientId,
      status: "scheduled",
      taskId: upcomingTaskId,
      title: "Prepare documents for visit",
    });
    await insertTask(getTestContext().sql, getTestContext().schemaName, {
      completedAt: "2026-03-19T10:00:00.000Z",
      dueDate: "2026-03-19",
      patientId: ownedPatientId,
      status: "completed",
      taskId: completedTaskId,
      title: "Attend ultrasound",
    });

    await getTestContext().sql.unsafe(
      `
        insert into "${getTestContext().schemaName}"."task_dependencies" (
          task_id,
          depends_on_task_id
        )
        values ($1, $2)
      `,
      [blockedTaskId, blockedPrerequisiteId],
    );

    const listResponse = await getTestContext().app.handle(
      new Request("http://localhost/api/v1/tasks", {
        headers: {
          "x-test-user-id": "user-1",
        },
      }),
    );
    const listPayload = (await listResponse.json()) as GlobalTaskListPayload;

    expect(listResponse.status).toBe(200);
    expect(listPayload.tasks.map((entry) => entry.task.id)).toEqual([
      overdueTaskId,
      pendingTaskId,
      blockedPrerequisiteId,
      blockedTaskId,
      upcomingTaskId,
      completedTaskId,
    ]);
    expect(
      listPayload.tasks.find((entry) => entry.task.id === overdueTaskId),
    ).toMatchObject({
      patient: {
        fullName: `Patient ${sharedPatientId}`,
        id: sharedPatientId,
      },
      task: {
        id: overdueTaskId,
        patientId: sharedPatientId,
        status: "pending",
      },
    });
    expect(
      listPayload.tasks.find((entry) => entry.task.id === blockedTaskId),
    ).toMatchObject({
      patient: {
        fullName: `Patient ${ownedPatientId}`,
        id: ownedPatientId,
      },
      task: {
        blockedByTaskIds: [blockedPrerequisiteId],
        id: blockedTaskId,
        status: "blocked",
      },
    });

    const pendingResponse = await getTestContext().app.handle(
      new Request("http://localhost/api/v1/tasks?state=pending", {
        headers: {
          "x-test-user-id": "user-1",
        },
      }),
    );
    const pendingPayload =
      (await pendingResponse.json()) as GlobalTaskListPayload;

    expect(pendingResponse.status).toBe(200);
    expect(pendingPayload.tasks.map((entry) => entry.task.id)).toEqual([
      pendingTaskId,
      blockedPrerequisiteId,
    ]);

    const blockedResponse = await getTestContext().app.handle(
      new Request("http://localhost/api/v1/tasks?state=blocked", {
        headers: {
          "x-test-user-id": "user-1",
        },
      }),
    );
    const blockedPayload =
      (await blockedResponse.json()) as GlobalTaskListPayload;

    expect(blockedResponse.status).toBe(200);
    expect(blockedPayload.tasks.map((entry) => entry.task.id)).toEqual([
      blockedTaskId,
    ]);

    const overdueResponse = await getTestContext().app.handle(
      new Request("http://localhost/api/v1/tasks?state=overdue", {
        headers: {
          "x-test-user-id": "user-1",
        },
      }),
    );
    const overduePayload =
      (await overdueResponse.json()) as GlobalTaskListPayload;

    expect(overdueResponse.status).toBe(200);
    expect(overduePayload.tasks.map((entry) => entry.task.id)).toEqual([
      overdueTaskId,
    ]);

    const upcomingResponse = await getTestContext().app.handle(
      new Request("http://localhost/api/v1/tasks?state=upcoming", {
        headers: {
          "x-test-user-id": "user-1",
        },
      }),
    );
    const upcomingPayload =
      (await upcomingResponse.json()) as GlobalTaskListPayload;

    expect(upcomingResponse.status).toBe(200);
    expect(upcomingPayload.tasks.map((entry) => entry.task.id)).toEqual([
      pendingTaskId,
      blockedPrerequisiteId,
      upcomingTaskId,
    ]);

    const completedResponse = await getTestContext().app.handle(
      new Request("http://localhost/api/v1/tasks?state=completed", {
        headers: {
          "x-test-user-id": "user-1",
        },
      }),
    );
    const completedPayload =
      (await completedResponse.json()) as GlobalTaskListPayload;

    expect(completedResponse.status).toBe(200);
    expect(completedPayload.tasks.map((entry) => entry.task.id)).toEqual([
      completedTaskId,
    ]);
  });

  it("evaluates blocked tasks from incomplete dependencies and prevents premature completion", async () => {
    const patientId = "11111111-1111-4111-8111-111111111111";

    const prerequisiteResponse = await getTestContext().app.handle(
      new Request(`http://localhost/api/v1/patients/${patientId}/tasks`, {
        body: JSON.stringify({
          taskType: "lab",
          title: "Complete blood test",
        }),
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "user-1",
        },
        method: "POST",
      }),
    );
    const prerequisitePayload =
      (await prerequisiteResponse.json()) as TaskPayload;

    const dependentResponse = await getTestContext().app.handle(
      new Request(`http://localhost/api/v1/patients/${patientId}/tasks`, {
        body: JSON.stringify({
          taskType: "visit",
          title: "Book specialist follow-up",
        }),
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "user-1",
        },
        method: "POST",
      }),
    );
    const dependentPayload = (await dependentResponse.json()) as TaskPayload;

    const addDependencyResponse = await getTestContext().app.handle(
      new Request(
        `http://localhost/api/v1/tasks/${dependentPayload.task.id}/dependencies`,
        {
          body: JSON.stringify({
            dependsOnTaskId: prerequisitePayload.task.id,
          }),
          headers: {
            "content-type": "application/json",
            "x-test-user-id": "user-1",
          },
          method: "POST",
        },
      ),
    );
    const addDependencyPayload =
      (await addDependencyResponse.json()) as TaskDependencyPayload;

    expect(addDependencyResponse.status).toBe(200);
    expect(addDependencyPayload.dependency).toMatchObject({
      dependsOnTaskId: prerequisitePayload.task.id,
      taskId: dependentPayload.task.id,
    });

    const dependencyListResponse = await getTestContext().app.handle(
      new Request(
        `http://localhost/api/v1/tasks/${dependentPayload.task.id}/dependencies`,
        {
          headers: {
            "x-test-user-id": "user-1",
          },
        },
      ),
    );
    const dependencyListPayload =
      (await dependencyListResponse.json()) as TaskDependencyListPayload;

    expect(dependencyListResponse.status).toBe(200);
    expect(dependencyListPayload.dependencies).toHaveLength(1);
    expect(dependencyListPayload.dependencies[0]?.dependsOnTaskId).toBe(
      prerequisitePayload.task.id,
    );

    const blockedGetResponse = await getTestContext().app.handle(
      new Request(`http://localhost/api/v1/tasks/${dependentPayload.task.id}`, {
        headers: {
          "x-test-user-id": "user-1",
        },
      }),
    );
    const blockedGetPayload = (await blockedGetResponse.json()) as TaskPayload;

    expect(blockedGetResponse.status).toBe(200);
    expect(blockedGetPayload.task.status).toBe("blocked");
    expect(blockedGetPayload.task.blockedByTaskIds).toEqual([
      prerequisitePayload.task.id,
    ]);

    const blockedCompleteResponse = await getTestContext().app.handle(
      new Request(
        `http://localhost/api/v1/tasks/${dependentPayload.task.id}/status`,
        {
          body: JSON.stringify({
            status: "completed",
          }),
          headers: {
            "content-type": "application/json",
            "x-test-user-id": "user-1",
          },
          method: "PATCH",
        },
      ),
    );

    expect(blockedCompleteResponse.status).toBe(409);
    expect(await blockedCompleteResponse.json()).toEqual({
      error: "task_dependencies_incomplete",
      message: "Task dependencies must be completed first.",
    });

    const completePrerequisiteResponse = await getTestContext().app.handle(
      new Request(
        `http://localhost/api/v1/tasks/${prerequisitePayload.task.id}/status`,
        {
          body: JSON.stringify({
            status: "completed",
          }),
          headers: {
            "content-type": "application/json",
            "x-test-user-id": "user-1",
          },
          method: "PATCH",
        },
      ),
    );

    expect(completePrerequisiteResponse.status).toBe(200);

    const unblockedGetResponse = await getTestContext().app.handle(
      new Request(`http://localhost/api/v1/tasks/${dependentPayload.task.id}`, {
        headers: {
          "x-test-user-id": "user-1",
        },
      }),
    );
    const unblockedGetPayload =
      (await unblockedGetResponse.json()) as TaskPayload;

    expect(unblockedGetPayload.task.status).toBe("pending");
    expect(unblockedGetPayload.task.blockedByTaskIds).toEqual([]);

    const removeDependencyResponse = await getTestContext().app.handle(
      new Request(
        `http://localhost/api/v1/tasks/${dependentPayload.task.id}/dependencies/${prerequisitePayload.task.id}`,
        {
          headers: {
            "x-test-user-id": "user-1",
          },
          method: "DELETE",
        },
      ),
    );

    expect(removeDependencyResponse.status).toBe(200);
    expect(await removeDependencyResponse.json()).toEqual({
      removed: true,
    });
  });

  it("rejects unauthenticated task access", async () => {
    const response = await getTestContext().app.handle(
      new Request(
        "http://localhost/api/v1/patients/11111111-1111-4111-8111-111111111111/tasks",
      ),
    );
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload).toEqual({
      error: "unauthorized",
      message: "Authentication required.",
    });
  });

  it("creates, lists, gets, updates, archives, and changes task status", async () => {
    const patientId = "11111111-1111-4111-8111-111111111111";
    const conditionId = "33333333-3333-4333-8333-333333333333";
    const instructionId = "55555555-5555-4555-8555-555555555555";
    const medicationId = "77777777-7777-4777-8777-777777777777";

    const createResponse = await getTestContext().app.handle(
      new Request(`http://localhost/api/v1/patients/${patientId}/tasks`, {
        body: JSON.stringify({
          autoRecurrenceEnabled: true,
          conditionId,
          description: " Take after breakfast ",
          dueDate: null,
          medicationId,
          medicalInstructionId: instructionId,
          recurrenceRule: " FREQ=DAILY ",
          scheduledAt: "2026-03-20T08:00:00.000Z",
          taskType: " medication_renewal ",
          title: " Morning insulin ",
        }),
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "user-1",
        },
        method: "POST",
      }),
    );
    const createPayload = (await createResponse.json()) as TaskPayload;
    const taskId = createPayload.task.id;

    expect(createResponse.status).toBe(200);
    expect(createPayload.task).toMatchObject({
      autoRecurrenceEnabled: true,
      blockedByTaskIds: [],
      completedAt: null,
      conditionId,
      description: "Take after breakfast",
      dueDate: "2026-04-15",
      medicationId,
      medicalInstructionId: instructionId,
      patientId,
      recurrenceRule: "FREQ=DAILY",
      scheduledAt: "2026-03-20T08:00:00.000Z",
      status: "pending",
      taskType: "medication_renewal",
      title: "Morning insulin",
    });

    const listResponse = await getTestContext().app.handle(
      new Request(`http://localhost/api/v1/patients/${patientId}/tasks`, {
        headers: {
          "x-test-user-id": "user-1",
        },
      }),
    );
    const listPayload = (await listResponse.json()) as TaskListPayload;

    expect(listResponse.status).toBe(200);
    expect(listPayload.tasks).toHaveLength(1);
    expect(listPayload.tasks[0]?.id).toBe(taskId);

    const getResponse = await getTestContext().app.handle(
      new Request(`http://localhost/api/v1/tasks/${taskId}`, {
        headers: {
          "x-test-user-id": "user-1",
        },
      }),
    );
    const getPayload = (await getResponse.json()) as TaskPayload;

    expect(getResponse.status).toBe(200);
    expect(getPayload.task.title).toBe("Morning insulin");

    const updateResponse = await getTestContext().app.handle(
      new Request(`http://localhost/api/v1/tasks/${taskId}`, {
        body: JSON.stringify({
          autoRecurrenceEnabled: true,
          description: null,
          recurrenceRule: "FREQ=WEEKLY",
          taskType: "follow-up",
          title: "Weekly follow-up",
        }),
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "user-1",
        },
        method: "PATCH",
      }),
    );
    const updatePayload = (await updateResponse.json()) as TaskPayload;

    expect(updateResponse.status).toBe(200);
    expect(updatePayload.task).toMatchObject({
      autoRecurrenceEnabled: true,
      blockedByTaskIds: [],
      description: null,
      medicationId,
      recurrenceRule: "FREQ=WEEKLY",
      taskType: "follow-up",
      title: "Weekly follow-up",
    });

    const statusResponse = await getTestContext().app.handle(
      new Request(`http://localhost/api/v1/tasks/${taskId}/status`, {
        body: JSON.stringify({
          status: "completed",
        }),
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "user-1",
        },
        method: "PATCH",
      }),
    );
    const statusPayload = (await statusResponse.json()) as TaskPayload;

    expect(statusResponse.status).toBe(200);
    expect(statusPayload.task.status).toBe("completed");
    expect(statusPayload.task.completedAt).not.toBeNull();

    const archiveResponse = await getTestContext().app.handle(
      new Request(`http://localhost/api/v1/tasks/${taskId}`, {
        headers: {
          "x-test-user-id": "user-1",
        },
        method: "DELETE",
      }),
    );
    const archivePayload = (await archiveResponse.json()) as TaskPayload;

    expect(archiveResponse.status).toBe(200);
    expect(archivePayload.task.deletedAt).not.toBeNull();

    const activeListResponse = await getTestContext().app.handle(
      new Request(`http://localhost/api/v1/patients/${patientId}/tasks`, {
        headers: {
          "x-test-user-id": "user-1",
        },
      }),
    );
    const activeListPayload =
      (await activeListResponse.json()) as TaskListPayload;

    expect(activeListPayload.tasks).toHaveLength(0);

    const archivedListResponse = await getTestContext().app.handle(
      new Request(
        `http://localhost/api/v1/patients/${patientId}/tasks?includeArchived=true`,
        {
          headers: {
            "x-test-user-id": "user-1",
          },
        },
      ),
    );
    const archivedListPayload =
      (await archivedListResponse.json()) as TaskListPayload;

    expect(archivedListPayload.tasks).toHaveLength(1);
    expect(archivedListPayload.tasks[0]?.id).toBe(taskId);
  });

  it("links renewal tasks to medications and defaults due dates from the medication GP contact date", async () => {
    const patientId = "11111111-1111-4111-8111-111111111111";
    const medicationId = "77777777-7777-4777-8777-777777777777";

    const createResponse = await getTestContext().app.handle(
      new Request(`http://localhost/api/v1/patients/${patientId}/tasks`, {
        body: JSON.stringify({
          taskType: "general_reminder",
          title: "Call GP about renewal",
        }),
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "user-1",
        },
        method: "POST",
      }),
    );
    const createPayload = (await createResponse.json()) as TaskPayload;

    expect(createPayload.task.medicationId).toBeNull();
    expect(createPayload.task.dueDate).toBeNull();
    expect(createPayload.task.autoRecurrenceEnabled).toBe(false);

    const linkResponse = await getTestContext().app.handle(
      new Request(`http://localhost/api/v1/tasks/${createPayload.task.id}`, {
        body: JSON.stringify({
          medicationId,
          taskType: "medication_renewal",
        }),
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "user-1",
        },
        method: "PATCH",
      }),
    );
    const linkPayload = (await linkResponse.json()) as TaskPayload;

    expect(linkResponse.status).toBe(200);
    expect(linkPayload.task).toMatchObject({
      autoRecurrenceEnabled: false,
      dueDate: "2026-04-15",
      medicationId,
      taskType: "medication_renewal",
      title: "Call GP about renewal",
    });
  });

  it("returns 404 for inaccessible or invalidly linked task resources", async () => {
    const patientId = "11111111-1111-4111-8111-111111111111";

    const unauthorizedListResponse = await getTestContext().app.handle(
      new Request(`http://localhost/api/v1/patients/${patientId}/tasks`, {
        headers: {
          "x-test-user-id": "user-2",
        },
      }),
    );

    expect(unauthorizedListResponse.status).toBe(404);

    const invalidLinkCreateResponse = await getTestContext().app.handle(
      new Request(`http://localhost/api/v1/patients/${patientId}/tasks`, {
        body: JSON.stringify({
          conditionId: "44444444-4444-4444-8444-444444444444",
          taskType: "medication",
          title: "Invalid link",
        }),
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "user-1",
        },
        method: "POST",
      }),
    );

    expect(invalidLinkCreateResponse.status).toBe(404);

    const invalidMedicationCreateResponse = await getTestContext().app.handle(
      new Request(`http://localhost/api/v1/patients/${patientId}/tasks`, {
        body: JSON.stringify({
          medicationId: "88888888-8888-4888-8888-888888888888",
          taskType: "medication_renewal",
          title: "Invalid medication link",
        }),
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "user-1",
        },
        method: "POST",
      }),
    );

    expect(invalidMedicationCreateResponse.status).toBe(404);

    const createResponse = await getTestContext().app.handle(
      new Request(`http://localhost/api/v1/patients/${patientId}/tasks`, {
        body: JSON.stringify({
          taskType: "appointment",
          title: "GP booking",
        }),
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "user-1",
        },
        method: "POST",
      }),
    );
    const createPayload = (await createResponse.json()) as TaskPayload;

    const unauthorizedGetResponse = await getTestContext().app.handle(
      new Request(`http://localhost/api/v1/tasks/${createPayload.task.id}`, {
        headers: {
          "x-test-user-id": "user-2",
        },
      }),
    );

    expect(unauthorizedGetResponse.status).toBe(404);

    const unauthorizedPatchResponse = await getTestContext().app.handle(
      new Request(`http://localhost/api/v1/tasks/${createPayload.task.id}`, {
        body: JSON.stringify({
          title: "Should fail",
        }),
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "user-2",
        },
        method: "PATCH",
      }),
    );

    expect(unauthorizedPatchResponse.status).toBe(404);

    const unauthorizedStatusResponse = await getTestContext().app.handle(
      new Request(
        `http://localhost/api/v1/tasks/${createPayload.task.id}/status`,
        {
          body: JSON.stringify({
            status: "cancelled",
          }),
          headers: {
            "content-type": "application/json",
            "x-test-user-id": "user-2",
          },
          method: "PATCH",
        },
      ),
    );

    expect(unauthorizedStatusResponse.status).toBe(404);

    const unauthorizedDependencyResponse = await getTestContext().app.handle(
      new Request(
        `http://localhost/api/v1/tasks/${createPayload.task.id}/dependencies`,
        {
          body: JSON.stringify({
            dependsOnTaskId: createPayload.task.id,
          }),
          headers: {
            "content-type": "application/json",
            "x-test-user-id": "user-2",
          },
          method: "POST",
        },
      ),
    );

    expect(unauthorizedDependencyResponse.status).toBe(404);
  });

  it("rejects circular and cross-patient task dependencies", async () => {
    const patientId = "11111111-1111-4111-8111-111111111111";
    const otherPatientId = "22222222-2222-4222-8222-222222222222";

    const firstTaskResponse = await getTestContext().app.handle(
      new Request(`http://localhost/api/v1/patients/${patientId}/tasks`, {
        body: JSON.stringify({
          taskType: "prep",
          title: "Prepare documents",
        }),
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "user-1",
        },
        method: "POST",
      }),
    );
    const firstTaskPayload = (await firstTaskResponse.json()) as TaskPayload;

    const secondTaskResponse = await getTestContext().app.handle(
      new Request(`http://localhost/api/v1/patients/${patientId}/tasks`, {
        body: JSON.stringify({
          taskType: "visit",
          title: "Attend visit",
        }),
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "user-1",
        },
        method: "POST",
      }),
    );
    const secondTaskPayload = (await secondTaskResponse.json()) as TaskPayload;

    const otherPatientTaskResponse = await getTestContext().app.handle(
      new Request(`http://localhost/api/v1/patients/${otherPatientId}/tasks`, {
        body: JSON.stringify({
          taskType: "lab",
          title: "Other patient prerequisite",
        }),
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "user-2",
        },
        method: "POST",
      }),
    );
    const otherPatientTaskPayload =
      (await otherPatientTaskResponse.json()) as TaskPayload;

    const addDependencyResponse = await getTestContext().app.handle(
      new Request(
        `http://localhost/api/v1/tasks/${secondTaskPayload.task.id}/dependencies`,
        {
          body: JSON.stringify({
            dependsOnTaskId: firstTaskPayload.task.id,
          }),
          headers: {
            "content-type": "application/json",
            "x-test-user-id": "user-1",
          },
          method: "POST",
        },
      ),
    );

    expect(addDependencyResponse.status).toBe(200);

    const cycleResponse = await getTestContext().app.handle(
      new Request(
        `http://localhost/api/v1/tasks/${firstTaskPayload.task.id}/dependencies`,
        {
          body: JSON.stringify({
            dependsOnTaskId: secondTaskPayload.task.id,
          }),
          headers: {
            "content-type": "application/json",
            "x-test-user-id": "user-1",
          },
          method: "POST",
        },
      ),
    );

    expect(cycleResponse.status).toBe(409);
    expect(await cycleResponse.json()).toEqual({
      error: "task_dependency_cycle",
      message: "Task dependency would create a cycle.",
    });

    const crossPatientResponse = await getTestContext().app.handle(
      new Request(
        `http://localhost/api/v1/tasks/${firstTaskPayload.task.id}/dependencies`,
        {
          body: JSON.stringify({
            dependsOnTaskId: otherPatientTaskPayload.task.id,
          }),
          headers: {
            "content-type": "application/json",
            "x-test-user-id": "user-1",
          },
          method: "POST",
        },
      ),
    );

    expect(crossPatientResponse.status).toBe(404);
  });
});
