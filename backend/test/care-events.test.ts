import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { Elysia } from "elysia";
import postgres from "postgres";

import { createCareEventsModule } from "../src/modules/care-events";
import { createCareEventsRepository } from "../src/modules/care-events/repository";
import { createCareEventsService } from "../src/modules/care-events/service";

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

type CareEventPayload = {
  careEvent: {
    bookingId: string | null;
    completedAt: string;
    createdAt: string;
    eventType: string;
    facilityId: string | null;
    id: string;
    outcomeNotes: string | null;
    patientId: string;
    providerName: string | null;
    subtype: string | null;
    updatedAt: string | null;
  };
};

type CareEventListPayload = {
  careEvents: Array<CareEventPayload["careEvent"]>;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

type CareEventSubtypesPayload = {
  subtypesByType: {
    exam: string[];
    specialist_visit: string[];
    treatment: string[];
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
        full_name
      )
      values ($1, $2)
    `,
    [patientId, `Patient ${patientId}`],
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
        city
      )
      values ($1, $2, $3)
    `,
    [facilityId, "San Carlo Hospital", "Milan"],
  );
};

const insertBooking = async (
  sql: postgres.Sql,
  schemaName: string,
  patientId: string,
  bookingId: string,
  facilityId: string | null = null,
): Promise<void> => {
  await sql.unsafe(
    `
      insert into "${schemaName}"."bookings" (
        id,
        patient_id,
        facility_id,
        booking_status,
        booked_at,
        appointment_at,
        notes
      )
      values ($1, $2, $3, 'completed', now(), now(), $4)
    `,
    [bookingId, patientId, facilityId, "Completed booking"],
  );
};

const insertCareEvent = async (
  sql: postgres.Sql,
  schemaName: string,
  patientId: string,
  input: {
    completedAt: string;
    eventType: "exam" | "specialist_visit" | "treatment";
    outcomeNotes?: string | null;
    providerName?: string | null;
    subtype?: string | null;
  },
): Promise<string> => {
  const [careEvent] = await sql.unsafe<Array<{ id: string }>>(
    `
      insert into "${schemaName}"."care_events" (
        patient_id,
        provider_name,
        event_type,
        subtype,
        completed_at,
        outcome_notes
      )
      values ($1, $2, $3, $4, $5, $6)
      returning id
    `,
    [
      patientId,
      input.providerName ?? null,
      input.eventType,
      input.subtype ?? null,
      input.completedAt,
      input.outcomeNotes ?? null,
    ],
  );

  if (!careEvent) {
    throw new Error("Failed to insert care event");
  }

  return careEvent.id;
};

beforeEach(async () => {
  const schemaName = `test_care_events_api_${randomUUID().replaceAll("-", "")}`;
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

  const repository = createCareEventsRepository(sql, schemaName);
  const service = createCareEventsService(repository);
  const app = new Elysia().group("/api/v1", (api) =>
    api.use(createCareEventsModule(createTestAuth(), service)),
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

describe("care events module", () => {
  it("rejects unauthenticated care-event listing", async () => {
    const response = await getTestContext().app.handle(
      new Request(
        "http://localhost/api/v1/patients/11111111-1111-4111-8111-111111111111/care-events",
      ),
    );
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload).toEqual({
      error: "unauthorized",
      message: "Authentication required.",
    });
  });

  it("creates, lists, gets, and updates patient-scoped care events", async () => {
    const { app, schemaName, sql } = getTestContext();
    const patientId = "11111111-1111-4111-8111-111111111111";
    const bookingId = "33333333-3333-4333-8333-333333333333";
    const facilityId = "44444444-4444-4444-8444-444444444444";

    await insertPatient(sql, schemaName, patientId, "user-1");
    await insertFacility(sql, schemaName, facilityId);
    await insertBooking(sql, schemaName, patientId, bookingId, facilityId);

    const createResponse = await app.handle(
      new Request(`http://localhost/api/v1/patients/${patientId}/care-events`, {
        body: JSON.stringify({
          bookingId,
          completedAt: "2026-04-22T08:20:00.000Z",
          eventType: "exam",
          facilityId,
          outcomeNotes: "  Exam completed, waiting for report.  ",
          providerName: "  Dr. Bianchi  ",
        }),
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "user-1",
        },
        method: "POST",
      }),
    );
    const createPayload = (await createResponse.json()) as CareEventPayload;

    expect(createResponse.status).toBe(200);
    expect(createPayload.careEvent).toMatchObject({
      bookingId,
      completedAt: "2026-04-22T08:20:00.000Z",
      eventType: "exam",
      facilityId,
      outcomeNotes: "Exam completed, waiting for report.",
      patientId,
      providerName: "Dr. Bianchi",
    });

    const careEventId = createPayload.careEvent.id;

    const listResponse = await app.handle(
      new Request(`http://localhost/api/v1/patients/${patientId}/care-events`, {
        headers: {
          "x-test-user-id": "user-1",
        },
      }),
    );
    const listPayload = (await listResponse.json()) as CareEventListPayload;

    expect(listResponse.status).toBe(200);
    expect(listPayload.careEvents).toHaveLength(1);
    expect(listPayload.careEvents[0]?.id).toBe(careEventId);
    expect(listPayload.pagination).toEqual({
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });

    const getResponse = await app.handle(
      new Request(`http://localhost/api/v1/care-events/${careEventId}`, {
        headers: {
          "x-test-user-id": "user-1",
        },
      }),
    );
    const getPayload = (await getResponse.json()) as CareEventPayload;

    expect(getResponse.status).toBe(200);
    expect(getPayload.careEvent.id).toBe(careEventId);

    const updateResponse = await app.handle(
      new Request(`http://localhost/api/v1/care-events/${careEventId}`, {
        body: JSON.stringify({
          bookingId: null,
          eventType: "specialist_visit",
          outcomeNotes: "  Specialist follow-up completed.  ",
          providerName: null,
        }),
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "user-1",
        },
        method: "PATCH",
      }),
    );
    const updatePayload = (await updateResponse.json()) as CareEventPayload;

    expect(updateResponse.status).toBe(200);
    expect(updatePayload.careEvent).toMatchObject({
      bookingId: null,
      eventType: "specialist_visit",
      outcomeNotes: "Specialist follow-up completed.",
      providerName: null,
    });

    const deleteResponse = await app.handle(
      new Request(`http://localhost/api/v1/care-events/${careEventId}`, {
        headers: {
          "x-test-user-id": "user-1",
        },
        method: "DELETE",
      }),
    );
    const deletePayload = (await deleteResponse.json()) as CareEventPayload;

    expect(deleteResponse.status).toBe(200);
    expect(deletePayload.careEvent.id).toBe(careEventId);

    const getAfterDeleteResponse = await app.handle(
      new Request(`http://localhost/api/v1/care-events/${careEventId}`, {
        headers: {
          "x-test-user-id": "user-1",
        },
      }),
    );
    const getAfterDeletePayload = await getAfterDeleteResponse.json();

    expect(getAfterDeleteResponse.status).toBe(404);
    expect(getAfterDeletePayload).toEqual({
      error: "care_event_not_found",
      message: "Care event not found.",
    });

    const listAfterDeleteResponse = await app.handle(
      new Request(`http://localhost/api/v1/patients/${patientId}/care-events`, {
        headers: {
          "x-test-user-id": "user-1",
        },
      }),
    );
    const listAfterDeletePayload =
      (await listAfterDeleteResponse.json()) as CareEventListPayload;

    expect(listAfterDeleteResponse.status).toBe(200);
    expect(listAfterDeletePayload.pagination.total).toBe(0);
    expect(listAfterDeletePayload.careEvents).toHaveLength(0);
  });

  it("searches, filters by subtype, and pages patient care events", async () => {
    const { app, schemaName, sql } = getTestContext();
    const patientId = "11111111-1111-4111-8111-111111111111";

    await insertPatient(sql, schemaName, patientId, "user-1");

    const bloodTestId = await insertCareEvent(sql, schemaName, patientId, {
      completedAt: "2026-04-22T08:20:00.000Z",
      eventType: "exam",
      outcomeNotes: "Routine blood panel completed.",
      providerName: "Dr. Bianchi",
      subtype: "Blood test",
    });
    const cardiologyId = await insertCareEvent(sql, schemaName, patientId, {
      completedAt: "2026-04-23T09:30:00.000Z",
      eventType: "specialist_visit",
      outcomeNotes: "Cardiology follow-up completed.",
      providerName: "Dr. Verdi",
      subtype: "Cardiology",
    });
    const therapyId = await insertCareEvent(sql, schemaName, patientId, {
      completedAt: "2026-04-24T10:45:00.000Z",
      eventType: "treatment",
      outcomeNotes: "Physical therapy session completed.",
      providerName: "Nurse Rossi",
      subtype: "Physical therapy",
    });

    const subtypeResponse = await app.handle(
      new Request(
        `http://localhost/api/v1/patients/${patientId}/care-events?subtype=blood%20test`,
        {
          headers: {
            "x-test-user-id": "user-1",
          },
        },
      ),
    );
    const subtypePayload =
      (await subtypeResponse.json()) as CareEventListPayload;

    expect(subtypeResponse.status).toBe(200);
    expect(subtypePayload.careEvents.map((careEvent) => careEvent.id)).toEqual([
      bloodTestId,
    ]);
    expect(subtypePayload.pagination.total).toBe(1);

    const filteredResponse = await app.handle(
      new Request(
        `http://localhost/api/v1/patients/${patientId}/care-events?search=dr.&eventType=specialist_visit&page=1&pageSize=1`,
        {
          headers: {
            "x-test-user-id": "user-1",
          },
        },
      ),
    );
    const filteredPayload =
      (await filteredResponse.json()) as CareEventListPayload;

    expect(filteredResponse.status).toBe(200);
    expect(filteredPayload.careEvents.map((careEvent) => careEvent.id)).toEqual(
      [cardiologyId],
    );
    expect(filteredPayload.pagination).toEqual({
      page: 1,
      pageSize: 1,
      total: 1,
      totalPages: 1,
    });

    const pagedResponse = await app.handle(
      new Request(
        `http://localhost/api/v1/patients/${patientId}/care-events?page=2&pageSize=2`,
        {
          headers: {
            "x-test-user-id": "user-1",
          },
        },
      ),
    );
    const pagedPayload = (await pagedResponse.json()) as CareEventListPayload;

    expect(pagedResponse.status).toBe(200);
    expect(pagedPayload.careEvents.map((careEvent) => careEvent.id)).toEqual([
      bloodTestId,
    ]);
    expect(
      pagedPayload.careEvents.map((careEvent) => careEvent.id),
    ).not.toContain(therapyId);
    expect(pagedPayload.pagination).toEqual({
      page: 2,
      pageSize: 2,
      total: 3,
      totalPages: 2,
    });
  });

  it("lists patient care event subtypes independently from event filters", async () => {
    const { app, schemaName, sql } = getTestContext();
    const patientId = "11111111-1111-4111-8111-111111111111";

    await insertPatient(sql, schemaName, patientId, "user-1");

    await insertCareEvent(sql, schemaName, patientId, {
      completedAt: "2026-04-22T08:20:00.000Z",
      eventType: "exam",
      subtype: "Blood test",
    });
    await insertCareEvent(sql, schemaName, patientId, {
      completedAt: "2026-04-23T09:30:00.000Z",
      eventType: "exam",
      subtype: "Urine test",
    });
    await insertCareEvent(sql, schemaName, patientId, {
      completedAt: "2026-04-24T10:45:00.000Z",
      eventType: "exam",
      subtype: "Blood test",
    });
    await insertCareEvent(sql, schemaName, patientId, {
      completedAt: "2026-04-25T10:45:00.000Z",
      eventType: "specialist_visit",
      subtype: "Cardiology",
    });
    await insertCareEvent(sql, schemaName, patientId, {
      completedAt: "2026-04-26T10:45:00.000Z",
      eventType: "treatment",
      subtype: null,
    });

    const response = await app.handle(
      new Request(
        `http://localhost/api/v1/patients/${patientId}/care-event-subtypes`,
        {
          headers: {
            "x-test-user-id": "user-1",
          },
        },
      ),
    );
    const payload = (await response.json()) as CareEventSubtypesPayload;

    expect(response.status).toBe(200);
    expect(payload.subtypesByType).toEqual({
      exam: ["Blood test", "Urine test"],
      specialist_visit: ["Cardiology"],
      treatment: [],
    });
  });

  it("rejects cross-patient booking references during create and update", async () => {
    const { app, schemaName, sql } = getTestContext();
    const patientId = "11111111-1111-4111-8111-111111111111";
    const otherPatientId = "22222222-2222-4222-8222-222222222222";
    const patientBookingId = "55555555-5555-4555-8555-555555555555";
    const otherBookingId = "66666666-6666-4666-8666-666666666666";

    await insertPatient(sql, schemaName, patientId, "user-1");
    await insertPatient(sql, schemaName, otherPatientId, "user-2");
    await insertBooking(sql, schemaName, patientId, patientBookingId);
    await insertBooking(sql, schemaName, otherPatientId, otherBookingId);

    const createResponse = await app.handle(
      new Request(`http://localhost/api/v1/patients/${patientId}/care-events`, {
        body: JSON.stringify({
          bookingId: otherBookingId,
          completedAt: "2026-04-22T08:20:00.000Z",
          eventType: "exam",
        }),
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "user-1",
        },
        method: "POST",
      }),
    );
    const createPayload = await createResponse.json();

    expect(createResponse.status).toBe(404);
    expect(createPayload).toEqual({
      error: "patient_not_found",
      message: "Patient not found.",
    });

    const validCreateResponse = await app.handle(
      new Request(`http://localhost/api/v1/patients/${patientId}/care-events`, {
        body: JSON.stringify({
          bookingId: patientBookingId,
          completedAt: "2026-04-22T08:20:00.000Z",
          eventType: "treatment",
        }),
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "user-1",
        },
        method: "POST",
      }),
    );
    const validCreatePayload =
      (await validCreateResponse.json()) as CareEventPayload;

    expect(validCreateResponse.status).toBe(200);

    const updateResponse = await app.handle(
      new Request(
        `http://localhost/api/v1/care-events/${validCreatePayload.careEvent.id}`,
        {
          body: JSON.stringify({
            bookingId: otherBookingId,
          }),
          headers: {
            "content-type": "application/json",
            "x-test-user-id": "user-1",
          },
          method: "PATCH",
        },
      ),
    );
    const updatePayload = await updateResponse.json();

    expect(updateResponse.status).toBe(404);
    expect(updatePayload).toEqual({
      error: "care_event_not_found",
      message: "Care event not found.",
    });
  });

  it("rejects inaccessible care-event reads", async () => {
    const { app, schemaName, sql } = getTestContext();
    const patientId = "11111111-1111-4111-8111-111111111111";
    const bookingId = "33333333-3333-4333-8333-333333333333";

    await insertPatient(sql, schemaName, patientId, "user-1");
    await insertBooking(sql, schemaName, patientId, bookingId);

    const createResponse = await app.handle(
      new Request(`http://localhost/api/v1/patients/${patientId}/care-events`, {
        body: JSON.stringify({
          bookingId,
          completedAt: "2026-04-22T08:20:00.000Z",
          eventType: "exam",
        }),
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "user-1",
        },
        method: "POST",
      }),
    );
    const createPayload = (await createResponse.json()) as CareEventPayload;

    const getResponse = await app.handle(
      new Request(
        `http://localhost/api/v1/care-events/${createPayload.careEvent.id}`,
        {
          headers: {
            "x-test-user-id": "user-2",
          },
        },
      ),
    );
    const getPayload = await getResponse.json();

    expect(getResponse.status).toBe(404);
    expect(getPayload).toEqual({
      error: "care_event_not_found",
      message: "Care event not found.",
    });
  });
});
