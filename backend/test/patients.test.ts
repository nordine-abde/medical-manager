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
  "0027_booking_title_and_status_removal.sql",
] as const;

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
    pendingPrescriptions: Array<{
      expirationDate: string | null;
      id: string;
      issueDate: string | null;
      notes: string | null;
      prescriptionType: string;
    }>;
    upcomingAppointments: Array<{
      appointmentAt: string;
      facilityId: string | null;
      id: string;
      prescriptionId: string | null;
      title: string;
    }>;
  };
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

  for (const migration of currentSchemaMigrations) {
    await applyMigration(sql, schemaName, migration);
  }

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
    const bookingId = randomUUID();
    const ignoredPastBookingId = randomUUID();
    const activePrescriptionId = randomUUID();
    const completedPrescriptionId = randomUUID();

    await getTestContext().sql.unsafe(
      `
        insert into "${getTestContext().schemaName}"."prescriptions" (
          id,
          patient_id,
          prescription_type,
          issue_date,
          expiration_date,
          notes,
          created_at
        )
        values
          ($1, $2, 'exam', current_date, current_date + interval '30 day', 'Waiting on GP reply', now() - interval '2 day'),
          ($3, $2, 'exam', current_date - interval '5 day', current_date + interval '20 day', 'Already handled', now() - interval '1 day')
      `,
      [activePrescriptionId, patientId, completedPrescriptionId],
    );

    await getTestContext().sql.unsafe(
      `
        insert into "${getTestContext().schemaName}"."bookings" (
          id,
          patient_id,
          prescription_id,
          facility_id,
          title,
          booked_at,
          appointment_at,
          notes
        )
        values
          ($1, $2, $3, null, 'Upcoming exam', now(), now() + interval '3 day', 'Upcoming exam'),
          ($4, $2, null, null, 'Completed visit', now() - interval '7 day', now() - interval '2 day', 'Completed visit')
      `,
      [bookingId, patientId, activePrescriptionId, ignoredPastBookingId],
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
    expect(overviewPayload.overview.pendingPrescriptions).toEqual([
      {
        expirationDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10),
        id: activePrescriptionId,
        issueDate: new Date().toISOString().slice(0, 10),
        notes: "Waiting on GP reply",
        prescriptionType: "exam",
      },
      {
        expirationDate: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10),
        id: completedPrescriptionId,
        issueDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10),
        notes: "Already handled",
        prescriptionType: "exam",
      },
    ]);
    expect(overviewPayload.overview.upcomingAppointments).toHaveLength(1);
    expect(overviewPayload.overview.upcomingAppointments[0]).toMatchObject({
      facilityId: null,
      id: bookingId,
      prescriptionId: activePrescriptionId,
      title: "Upcoming exam",
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
});
