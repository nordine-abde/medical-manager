import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { Elysia } from "elysia";
import postgres from "postgres";

import { createPatientsModule } from "../src/modules/patients";
import { createPatientsRepository } from "../src/modules/patients/repository";
import { createPatientsService } from "../src/modules/patients/service";

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

let testContext: TestContext | null = null;

type PatientPayload = {
  patient: {
    archived: boolean;
    dateOfBirth: string | null;
    fullName: string;
    id: string;
    notes: string | null;
  };
};

type PatientListPayload = {
  patients: Array<PatientPayload["patient"]>;
};

type PatientUserPayload = {
  user: {
    email: string;
    fullName: string;
    id: string;
    linkedAt: string;
  };
};

type PatientUserListPayload = {
  users: Array<PatientUserPayload["user"]>;
};

type PatientOverviewPayload = {
  overview: {
    activeConditions: Array<{
      id: string;
      name: string;
      notes: string | null;
    }>;
    activeMedications: Array<{
      conditionName: string | null;
      id: string;
      name: string;
      nextGpContactDate: string | null;
      quantity: string;
      renewalCadence: string | null;
      renewalTask: {
        dueDate: string | null;
        id: string;
        status: string | null;
        title: string | null;
      } | null;
    }>;
    overdueTaskCount: number;
    pendingPrescriptions: Array<{
      expirationDate: string | null;
      id: string;
      issueDate: string | null;
      notes: string | null;
      prescriptionType: string;
      status: string;
      taskId: string | null;
    }>;
    upcomingAppointments: Array<{
      appointmentAt: string;
      facilityId: string | null;
      id: string;
      prescriptionId: string | null;
      status: string;
      taskId: string;
    }>;
  };
};

type PatientTimelinePayload = {
  timeline: Array<{
    eventDate: string;
    id: string;
    patientId: string;
    relatedEntity: {
      id: string;
      type:
        | "booking"
        | "care_event"
        | "document"
        | "medical_instruction"
        | "medication"
        | "prescription"
        | "task";
    };
    summary: string;
    type:
      | "booking"
      | "care_event"
      | "document"
      | "medical_instruction"
      | "medication"
      | "prescription"
      | "task";
  }>;
};

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

beforeEach(async () => {
  const schemaName = `test_patients_${randomUUID().replaceAll("-", "")}`;
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
  await applyMigration(sql, schemaName, "0012_medication_archiving.sql");
  await applyMigration(sql, schemaName, "0013_task_medication_links.sql");
  await applyMigration(sql, schemaName, "0014_documents.sql");
  await applyMigration(sql, schemaName, "0015_care_events.sql");
  await insertTestUser(sql, schemaName, "user-1");
  await insertTestUser(sql, schemaName, "user-2");
  await insertTestUser(sql, schemaName, "user-3");

  const repository = createPatientsRepository(sql, schemaName);
  const service = createPatientsService(repository);
  const app = new Elysia().group("/api/v1", (api) =>
    api.use(createPatientsModule(createTestAuth(), service)),
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

describe("patients module", () => {
  it("rejects unauthenticated patient access", async () => {
    const response = await getTestContext().app.handle(
      new Request("http://localhost/api/v1/patients"),
    );
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload).toEqual({
      error: "unauthorized",
      message: "Authentication required.",
    });
  });

  it("creates, lists, gets, updates, archives, and restores authorized patients", async () => {
    const createResponse = await getTestContext().app.handle(
      new Request("http://localhost/api/v1/patients", {
        body: JSON.stringify({
          dateOfBirth: "1958-05-11",
          fullName: "Maria Rossi",
          notes: "Main chronic follow-up patient",
        }),
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "user-1",
        },
        method: "POST",
      }),
    );
    const createPayload = (await createResponse.json()) as PatientPayload;
    const patientId = createPayload.patient.id as string;

    expect(createResponse.status).toBe(200);
    expect(createPayload.patient.fullName).toBe("Maria Rossi");
    expect(createPayload.patient.archived).toBe(false);

    const listResponse = await getTestContext().app.handle(
      new Request("http://localhost/api/v1/patients?search=Maria", {
        headers: {
          "x-test-user-id": "user-1",
        },
      }),
    );
    const listPayload = (await listResponse.json()) as PatientListPayload;
    const listedPatient = listPayload.patients.at(0);

    expect(listResponse.status).toBe(200);
    expect(listPayload.patients).toHaveLength(1);
    expect(listedPatient).toBeDefined();

    if (!listedPatient) {
      throw new Error("Expected listed patient to exist");
    }

    expect(listedPatient.id).toBe(patientId);

    const getResponse = await getTestContext().app.handle(
      new Request(`http://localhost/api/v1/patients/${patientId}`, {
        headers: {
          "x-test-user-id": "user-1",
        },
      }),
    );
    const getPayload = (await getResponse.json()) as PatientPayload;

    expect(getResponse.status).toBe(200);
    expect(getPayload.patient.dateOfBirth).toBe("1958-05-11");

    const unauthorizedGetResponse = await getTestContext().app.handle(
      new Request(`http://localhost/api/v1/patients/${patientId}`, {
        headers: {
          "x-test-user-id": "user-2",
        },
      }),
    );

    expect(unauthorizedGetResponse.status).toBe(404);

    const updateResponse = await getTestContext().app.handle(
      new Request(`http://localhost/api/v1/patients/${patientId}`, {
        body: JSON.stringify({
          fullName: "Maria Bianchi",
          notes: "Updated note",
        }),
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "user-1",
        },
        method: "PATCH",
      }),
    );
    const updatePayload = (await updateResponse.json()) as PatientPayload;

    expect(updateResponse.status).toBe(200);
    expect(updatePayload.patient.fullName).toBe("Maria Bianchi");
    expect(updatePayload.patient.notes).toBe("Updated note");

    const archiveResponse = await getTestContext().app.handle(
      new Request(`http://localhost/api/v1/patients/${patientId}`, {
        headers: {
          "x-test-user-id": "user-1",
        },
        method: "DELETE",
      }),
    );
    const archivePayload = (await archiveResponse.json()) as PatientPayload;

    expect(archiveResponse.status).toBe(200);
    expect(archivePayload.patient.archived).toBe(true);

    const activeListResponse = await getTestContext().app.handle(
      new Request("http://localhost/api/v1/patients", {
        headers: {
          "x-test-user-id": "user-1",
        },
      }),
    );
    const activeListPayload =
      (await activeListResponse.json()) as PatientListPayload;

    expect(activeListResponse.status).toBe(200);
    expect(activeListPayload.patients).toHaveLength(0);

    const archivedListResponse = await getTestContext().app.handle(
      new Request("http://localhost/api/v1/patients?includeArchived=true", {
        headers: {
          "x-test-user-id": "user-1",
        },
      }),
    );
    const archivedListPayload =
      (await archivedListResponse.json()) as PatientListPayload;
    const archivedPatient = archivedListPayload.patients.at(0);

    expect(archivedListResponse.status).toBe(200);
    expect(archivedListPayload.patients).toHaveLength(1);
    expect(archivedPatient).toBeDefined();

    if (!archivedPatient) {
      throw new Error("Expected archived patient to exist");
    }

    expect(archivedPatient.archived).toBe(true);

    const restoreResponse = await getTestContext().app.handle(
      new Request(`http://localhost/api/v1/patients/${patientId}/restore`, {
        headers: {
          "x-test-user-id": "user-1",
        },
        method: "POST",
      }),
    );
    const restorePayload = (await restoreResponse.json()) as PatientPayload;

    expect(restoreResponse.status).toBe(200);
    expect(restorePayload.patient.archived).toBe(false);
  });

  it("returns an aggregated overview for authorized patient members", async () => {
    const createResponse = await getTestContext().app.handle(
      new Request("http://localhost/api/v1/patients", {
        body: JSON.stringify({
          fullName: "Luigi Verdi",
        }),
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "user-1",
        },
        method: "POST",
      }),
    );
    const createPayload = (await createResponse.json()) as PatientPayload;
    const patientId = createPayload.patient.id;
    const taskId = randomUUID();
    const completedTaskId = randomUUID();
    const bookingId = randomUUID();
    const ignoredPastBookingId = randomUUID();
    const activePrescriptionId = randomUUID();
    const completedPrescriptionId = randomUUID();
    const activeConditionId = randomUUID();
    const inactiveConditionId = randomUUID();
    const medicationId = randomUUID();
    const renewalTaskId = randomUUID();

    await getTestContext().sql.unsafe(
      `
        insert into "${getTestContext().schemaName}"."tasks" (
          id,
          patient_id,
          title,
          description,
          task_type,
          status,
          due_date,
          scheduled_at,
          auto_recurrence_enabled,
          recurrence_rule,
          completed_at
        )
        values
          ($1, $2, 'Blood test', null, 'exam', 'pending', current_date - interval '2 day', null, false, null, null),
          ($3, $2, 'Completed task', null, 'visit', 'completed', current_date - interval '1 day', null, false, null, now())
      `,
      [taskId, patientId, completedTaskId],
    );

    await getTestContext().sql.unsafe(
      `
        insert into "${getTestContext().schemaName}"."medications" (
          id,
          patient_id,
          condition_id,
          name,
          dosage,
          quantity,
          prescribing_doctor,
          renewal_cadence,
          next_gp_contact_date,
          notes
        )
        values (
          $1,
          $2,
          null,
          'Atorvastatin',
          '1 tablet nightly',
          '30 tablets',
          'Dr. Conti',
          'Monthly',
          current_date + interval '6 day',
          'Review lipid profile before renewal'
        )
      `,
      [medicationId, patientId],
    );

    await getTestContext().sql.unsafe(
      `
        insert into "${getTestContext().schemaName}"."conditions" (
          id,
          patient_id,
          name,
          notes,
          active
        )
        values
          ($1, $2, 'Hypertension', 'Monitor blood pressure weekly', true),
          ($3, $2, 'Recovered fracture', 'Inactive follow-up', false)
      `,
      [activeConditionId, patientId, inactiveConditionId],
    );

    await getTestContext().sql.unsafe(
      `
        update "${getTestContext().schemaName}"."medications"
        set condition_id = $1
        where id = $2
      `,
      [activeConditionId, medicationId],
    );

    await getTestContext().sql.unsafe(
      `
        insert into "${getTestContext().schemaName}"."prescriptions" (
          id,
          patient_id,
          task_id,
          medication_id,
          prescription_type,
          requested_at,
          received_at,
          collected_at,
          issue_date,
          expiration_date,
          status,
          notes
        )
        values
          ($1, $2, $3, null, 'exam', now() - interval '1 day', null, null, current_date, current_date + interval '30 day', 'requested', 'Waiting on GP reply'),
          ($4, $2, null, null, 'medication', now() - interval '5 day', now() - interval '4 day', now() - interval '3 day', current_date - interval '5 day', current_date + interval '20 day', 'collected', 'Already handled')
      `,
      [activePrescriptionId, patientId, taskId, completedPrescriptionId],
    );

    await getTestContext().sql.unsafe(
      `
        insert into "${getTestContext().schemaName}"."tasks" (
          id,
          patient_id,
          medication_id,
          title,
          description,
          task_type,
          status,
          due_date,
          scheduled_at,
          auto_recurrence_enabled,
          recurrence_rule,
          completed_at
        )
        values (
          $1,
          $2,
          $3,
          'Renew statin',
          null,
          'medication_renewal',
          'pending',
          current_date + interval '4 day',
          null,
          false,
          null,
          null
        )
      `,
      [renewalTaskId, patientId, medicationId],
    );

    await getTestContext().sql.unsafe(
      `
        insert into "${getTestContext().schemaName}"."bookings" (
          id,
          patient_id,
          task_id,
          prescription_id,
          facility_id,
          booking_status,
          booked_at,
          appointment_at,
          notes
        )
        values
          ($1, $2, $3, $4, null, 'booked', now(), now() + interval '3 day', 'Upcoming exam'),
          ($5, $2, $3, null, null, 'completed', now() - interval '7 day', now() - interval '2 day', 'Completed visit')
      `,
      [
        bookingId,
        patientId,
        taskId,
        activePrescriptionId,
        ignoredPastBookingId,
      ],
    );

    const overviewResponse = await getTestContext().app.handle(
      new Request(`http://localhost/api/v1/patients/${patientId}/overview`, {
        headers: {
          "x-test-user-id": "user-1",
        },
      }),
    );
    const overviewPayload =
      (await overviewResponse.json()) as PatientOverviewPayload;

    expect(overviewResponse.status).toBe(200);
    expect(overviewPayload.overview.overdueTaskCount).toBe(1);
    expect(overviewPayload.overview.activeConditions).toEqual([
      {
        id: activeConditionId,
        name: "Hypertension",
        notes: "Monitor blood pressure weekly",
      },
    ]);
    expect(overviewPayload.overview.activeMedications).toEqual([
      {
        conditionName: "Hypertension",
        id: medicationId,
        name: "Atorvastatin",
        nextGpContactDate: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10),
        quantity: "30 tablets",
        renewalCadence: "Monthly",
        renewalTask: {
          dueDate: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000)
            .toISOString()
            .slice(0, 10),
          id: renewalTaskId,
          status: "pending",
          title: "Renew statin",
        },
      },
    ]);
    expect(overviewPayload.overview.pendingPrescriptions).toEqual([
      {
        expirationDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10),
        id: activePrescriptionId,
        issueDate: new Date().toISOString().slice(0, 10),
        notes: "Waiting on GP reply",
        prescriptionType: "exam",
        status: "requested",
        taskId,
      },
    ]);
    expect(overviewPayload.overview.upcomingAppointments).toHaveLength(1);
    expect(overviewPayload.overview.upcomingAppointments[0]).toMatchObject({
      facilityId: null,
      id: bookingId,
      prescriptionId: activePrescriptionId,
      status: "booked",
      taskId,
    });

    const unauthorizedOverviewResponse = await getTestContext().app.handle(
      new Request(`http://localhost/api/v1/patients/${patientId}/overview`, {
        headers: {
          "x-test-user-id": "user-2",
        },
      }),
    );

    expect(unauthorizedOverviewResponse.status).toBe(404);
  });

  it("lists, adds, rejects duplicates for, and removes patient users", async () => {
    const createResponse = await getTestContext().app.handle(
      new Request("http://localhost/api/v1/patients", {
        body: JSON.stringify({
          fullName: "Shared Patient",
        }),
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "user-1",
        },
        method: "POST",
      }),
    );
    const createPayload = (await createResponse.json()) as PatientPayload;
    const patientId = createPayload.patient.id;

    const initialUsersResponse = await getTestContext().app.handle(
      new Request(`http://localhost/api/v1/patients/${patientId}/users`, {
        headers: {
          "x-test-user-id": "user-1",
        },
      }),
    );
    const initialUsersPayload =
      (await initialUsersResponse.json()) as PatientUserListPayload;

    expect(initialUsersResponse.status).toBe(200);
    expect(initialUsersPayload.users).toHaveLength(1);
    expect(initialUsersPayload.users[0]).toMatchObject({
      email: "user-1@example.com",
      fullName: "User user-1",
      id: "user-1",
    });

    const addUserResponse = await getTestContext().app.handle(
      new Request(`http://localhost/api/v1/patients/${patientId}/users`, {
        body: JSON.stringify({
          identifier: "user-2@example.com",
        }),
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "user-1",
        },
        method: "POST",
      }),
    );
    const addUserPayload = (await addUserResponse.json()) as PatientUserPayload;

    expect(addUserResponse.status).toBe(200);
    expect(addUserPayload.user).toMatchObject({
      email: "user-2@example.com",
      fullName: "User user-2",
      id: "user-2",
    });

    const duplicateAddResponse = await getTestContext().app.handle(
      new Request(`http://localhost/api/v1/patients/${patientId}/users`, {
        body: JSON.stringify({
          identifier: "user-2",
        }),
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "user-1",
        },
        method: "POST",
      }),
    );
    const duplicateAddPayload = await duplicateAddResponse.json();

    expect(duplicateAddResponse.status).toBe(409);
    expect(duplicateAddPayload).toEqual({
      error: "patient_user_already_linked",
      message: "User already has access to this patient.",
    });

    const sharedAccessResponse = await getTestContext().app.handle(
      new Request(`http://localhost/api/v1/patients/${patientId}`, {
        headers: {
          "x-test-user-id": "user-2",
        },
      }),
    );

    expect(sharedAccessResponse.status).toBe(200);

    const listAfterAddResponse = await getTestContext().app.handle(
      new Request(`http://localhost/api/v1/patients/${patientId}/users`, {
        headers: {
          "x-test-user-id": "user-1",
        },
      }),
    );
    const listAfterAddPayload =
      (await listAfterAddResponse.json()) as PatientUserListPayload;

    expect(listAfterAddResponse.status).toBe(200);
    expect(listAfterAddPayload.users.map((user) => user.id)).toEqual([
      "user-1",
      "user-2",
    ]);

    const removeUserResponse = await getTestContext().app.handle(
      new Request(
        `http://localhost/api/v1/patients/${patientId}/users/user-2`,
        {
          headers: {
            "x-test-user-id": "user-1",
          },
          method: "DELETE",
        },
      ),
    );
    const removeUserPayload =
      (await removeUserResponse.json()) as PatientUserPayload;

    expect(removeUserResponse.status).toBe(200);
    expect(removeUserPayload.user.id).toBe("user-2");

    const revokedAccessResponse = await getTestContext().app.handle(
      new Request(`http://localhost/api/v1/patients/${patientId}`, {
        headers: {
          "x-test-user-id": "user-2",
        },
      }),
    );

    expect(revokedAccessResponse.status).toBe(404);
  });

  it("returns a filtered patient timeline for authorized members", async () => {
    const createResponse = await getTestContext().app.handle(
      new Request("http://localhost/api/v1/patients", {
        body: JSON.stringify({
          fullName: "Timeline Patient",
        }),
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "user-1",
        },
        method: "POST",
      }),
    );
    const createPayload = (await createResponse.json()) as PatientPayload;
    const patientId = createPayload.patient.id;
    const taskId = randomUUID();
    const instructionId = randomUUID();
    const prescriptionId = randomUUID();
    const bookingId = randomUUID();
    const medicationId = randomUUID();
    const careEventId = randomUUID();
    const documentId = randomUUID();

    await getTestContext().sql.unsafe(
      `
        insert into "${getTestContext().schemaName}"."tasks" (
          id,
          patient_id,
          title,
          description,
          task_type,
          status,
          due_date,
          scheduled_at,
          auto_recurrence_enabled,
          recurrence_rule,
          completed_at
        )
        values (
          $1,
          $2,
          'Review bloodwork',
          null,
          'exam',
          'pending',
          '2026-03-20',
          null,
          false,
          null,
          null
        )
      `,
      [taskId, patientId],
    );

    await getTestContext().sql.unsafe(
      `
        insert into "${getTestContext().schemaName}"."medical_instructions" (
          id,
          patient_id,
          doctor_name,
          instruction_date,
          original_notes,
          status,
          created_by_user_id
        )
        values ($1, $2, 'Dr. Timeline', '2026-03-18', 'Schedule a follow-up exam', 'active', 'user-1')
      `,
      [instructionId, patientId],
    );

    await getTestContext().sql.unsafe(
      `
        insert into "${getTestContext().schemaName}"."prescriptions" (
          id,
          patient_id,
          task_id,
          medication_id,
          prescription_type,
          requested_at,
          received_at,
          collected_at,
          issue_date,
          expiration_date,
          status,
          notes
        )
        values (
          $1,
          $2,
          $3,
          null,
          'exam',
          '2026-03-17T09:00:00.000Z',
          null,
          null,
          '2026-03-17',
          '2026-04-17',
          'requested',
          'Awaiting specialist review'
        )
      `,
      [prescriptionId, patientId, taskId],
    );

    await getTestContext().sql.unsafe(
      `
        insert into "${getTestContext().schemaName}"."bookings" (
          id,
          patient_id,
          task_id,
          prescription_id,
          facility_id,
          booking_status,
          booked_at,
          appointment_at,
          notes
        )
        values (
          $1,
          $2,
          $3,
          $4,
          null,
          'booked',
          '2026-03-18T10:00:00.000Z',
          '2026-03-22T11:30:00.000Z',
          'Follow-up booking'
        )
      `,
      [bookingId, patientId, taskId, prescriptionId],
    );

    await getTestContext().sql.unsafe(
      `
        insert into "${getTestContext().schemaName}"."medications" (
          id,
          patient_id,
          name,
          dosage,
          quantity,
          next_gp_contact_date,
          notes
        )
        values (
          $1,
          $2,
          'Metformin',
          '500mg twice daily',
          '60 tablets',
          '2026-03-24',
          'Monitor glucose levels'
        )
      `,
      [medicationId, patientId],
    );

    await getTestContext().sql.unsafe(
      `
        insert into "${getTestContext().schemaName}"."care_events" (
          id,
          patient_id,
          task_id,
          booking_id,
          facility_id,
          provider_name,
          event_type,
          completed_at,
          outcome_notes
        )
        values (
          $1,
          $2,
          $3,
          $4,
          null,
          'Dr. Timeline',
          'exam',
          '2026-03-19T15:00:00.000Z',
          'Bloodwork reviewed'
        )
      `,
      [careEventId, patientId, taskId, bookingId],
    );

    await getTestContext().sql.unsafe(
      `
        insert into "${getTestContext().schemaName}"."documents" (
          id,
          patient_id,
          related_entity_type,
          related_entity_id,
          stored_filename,
          original_filename,
          mime_type,
          file_size_bytes,
          document_type,
          uploaded_by_user_id,
          notes,
          uploaded_at
        )
        values (
          $1,
          $2,
          'care_event',
          $3,
          '2026/03/19/report.pdf',
          'report.pdf',
          'application/pdf',
          128,
          'visit_report',
          'user-1',
          'Uploaded visit report',
          '2026-03-19T16:00:00.000Z'
        )
      `,
      [documentId, patientId, careEventId],
    );

    const timelineResponse = await getTestContext().app.handle(
      new Request(
        `http://localhost/api/v1/patients/${patientId}/timeline?startDate=2026-03-18&endDate=2026-03-24`,
        {
          headers: {
            "x-test-user-id": "user-1",
          },
        },
      ),
    );
    const timelinePayload =
      (await timelineResponse.json()) as PatientTimelinePayload;

    expect(timelineResponse.status).toBe(200);
    expect(timelinePayload.timeline.map((item) => item.type)).toEqual([
      "medication",
      "booking",
      "task",
      "document",
      "care_event",
      "medical_instruction",
    ]);
    expect(timelinePayload.timeline[0]).toMatchObject({
      patientId,
      relatedEntity: {
        id: medicationId,
        type: "medication",
      },
      summary: "Metformin",
      type: "medication",
    });
    expect(timelinePayload.timeline[3]).toMatchObject({
      relatedEntity: {
        id: documentId,
        type: "document",
      },
      summary: "report.pdf",
      type: "document",
    });

    const filteredResponse = await getTestContext().app.handle(
      new Request(
        `http://localhost/api/v1/patients/${patientId}/timeline?eventType=document`,
        {
          headers: {
            "x-test-user-id": "user-1",
          },
        },
      ),
    );
    const filteredPayload =
      (await filteredResponse.json()) as PatientTimelinePayload;

    expect(filteredResponse.status).toBe(200);
    expect(filteredPayload.timeline).toHaveLength(1);
    expect(filteredPayload.timeline[0]).toMatchObject({
      relatedEntity: {
        id: documentId,
        type: "document",
      },
      type: "document",
    });

    const unauthorizedResponse = await getTestContext().app.handle(
      new Request(`http://localhost/api/v1/patients/${patientId}/timeline`, {
        headers: {
          "x-test-user-id": "user-2",
        },
      }),
    );

    expect(unauthorizedResponse.status).toBe(404);
  });
});
