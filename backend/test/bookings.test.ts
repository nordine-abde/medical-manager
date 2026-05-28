import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { Elysia } from "elysia";
import postgres from "postgres";

import { createBookingsModule } from "../src/modules/bookings";
import { createBookingsRepository } from "../src/modules/bookings/repository";
import { createBookingsService } from "../src/modules/bookings/service";
import { createFacilitiesModule } from "../src/modules/facilities";
import { createFacilitiesRepository } from "../src/modules/facilities/repository";
import { createFacilitiesService } from "../src/modules/facilities/service";

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

type FacilityPayload = {
  facility: {
    address: string | null;
    city: string | null;
    facilityType: string | null;
    id: string;
    name: string;
    notes: string | null;
  };
};

type FacilityListPayload = {
  facilities: Array<FacilityPayload["facility"]>;
};

type BookingPayload = {
  booking: {
    appointmentAt: string | null;
    bookedAt: string | null;
    deletedAt: string | null;
    facilityId: string | null;
    id: string;
    notes: string | null;
    patientId: string;
    prescriptionId: string | null;
    title: string;
  };
};

type BookingListPayload = {
  bookings: Array<BookingPayload["booking"]>;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
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
  prescriptionId: string,
): Promise<void> => {
  await sql.unsafe(
    `
      insert into "${schemaName}"."prescriptions" (
        id,
        patient_id,
        prescription_type,
        subtype
      )
      values ($1, $2, 'exam', 'Blood panel')
    `,
    [prescriptionId, patientId],
  );
};

const insertCareEvent = async (
  sql: postgres.Sql,
  schemaName: string,
  patientId: string,
  bookingId: string,
): Promise<string> => {
  const [careEvent] = await sql.unsafe<Array<{ id: string }>>(
    `
      insert into "${schemaName}"."care_events" (
        patient_id,
        booking_id,
        event_type,
        completed_at,
        outcome_notes
      )
      values ($1, $2, 'exam', '2026-04-22T08:00:00.000Z', 'Completed')
      returning id
    `,
    [patientId, bookingId],
  );

  if (!careEvent) {
    throw new Error("Failed to insert care event");
  }

  return careEvent.id;
};

beforeEach(async () => {
  const schemaName = `test_bookings_${randomUUID().replaceAll("-", "")}`;
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
  await insertPrescription(
    sql,
    schemaName,
    "11111111-1111-4111-8111-111111111111",
    "55555555-5555-4555-8555-555555555555",
  );
  await insertPrescription(
    sql,
    schemaName,
    "22222222-2222-4222-8222-222222222222",
    "66666666-6666-4666-8666-666666666666",
  );

  const facilitiesRepository = createFacilitiesRepository(sql, schemaName);
  const facilitiesService = createFacilitiesService(facilitiesRepository);
  const bookingsRepository = createBookingsRepository(sql, schemaName);
  const bookingsService = createBookingsService(bookingsRepository);
  const auth = createTestAuth();
  const app = new Elysia().group("/api/v1", (api) =>
    api
      .use(createFacilitiesModule(auth, facilitiesService))
      .use(createBookingsModule(auth, bookingsService)),
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

describe("bookings and facilities modules", () => {
  it("rejects unauthenticated facility access", async () => {
    const response = await getTestContext().app.handle(
      new Request("http://localhost/api/v1/facilities"),
    );
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload).toEqual({
      error: "unauthorized",
      message: "Authentication required.",
    });
  });

  it("creates facilities and supports booking CRUD with pagination and filters", async () => {
    const createFacilityResponse = await getTestContext().app.handle(
      new Request("http://localhost/api/v1/facilities", {
        body: JSON.stringify({
          address: "Via Roma 12",
          city: "Rome",
          facilityType: "hospital",
          name: "San Marco Hospital",
          notes: "Bring ID card",
        }),
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "user-1",
        },
        method: "POST",
      }),
    );
    const createFacilityPayload =
      (await createFacilityResponse.json()) as FacilityPayload;

    expect(createFacilityResponse.status).toBe(200);
    expect(createFacilityPayload.facility.name).toBe("San Marco Hospital");

    const facilityId = createFacilityPayload.facility.id;

    const listFacilityResponse = await getTestContext().app.handle(
      new Request("http://localhost/api/v1/facilities?search=marco&city=rome", {
        headers: {
          "x-test-user-id": "user-1",
        },
      }),
    );
    const listFacilityPayload =
      (await listFacilityResponse.json()) as FacilityListPayload;

    expect(listFacilityResponse.status).toBe(200);
    expect(listFacilityPayload.facilities).toHaveLength(1);
    expect(listFacilityPayload.facilities[0]?.id).toBe(facilityId);

    const updateFacilityResponse = await getTestContext().app.handle(
      new Request(`http://localhost/api/v1/facilities/${facilityId}`, {
        body: JSON.stringify({
          notes: "Bring ID card and prior exam results",
        }),
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "user-1",
        },
        method: "PATCH",
      }),
    );
    const updateFacilityPayload =
      (await updateFacilityResponse.json()) as FacilityPayload;

    expect(updateFacilityResponse.status).toBe(200);
    expect(updateFacilityPayload.facility.notes).toContain(
      "prior exam results",
    );

    const createBookingResponse = await getTestContext().app.handle(
      new Request(
        "http://localhost/api/v1/patients/11111111-1111-4111-8111-111111111111/bookings",
        {
          body: JSON.stringify({
            appointmentAt: "2026-04-22T07:30:00.000Z",
            facilityId,
            notes: "Bring paper prescription",
            prescriptionId: "55555555-5555-4555-8555-555555555555",
            title: "Blood panel booking",
          }),
          headers: {
            "content-type": "application/json",
            "x-test-user-id": "user-1",
          },
          method: "POST",
        },
      ),
    );
    const createBookingPayload =
      (await createBookingResponse.json()) as BookingPayload;

    expect(createBookingResponse.status).toBe(200);
    expect(createBookingPayload.booking.facilityId).toBe(facilityId);
    expect(createBookingPayload.booking.title).toBe("Blood panel booking");

    const bookingId = createBookingPayload.booking.id;

    const getBookingResponse = await getTestContext().app.handle(
      new Request(`http://localhost/api/v1/bookings/${bookingId}`, {
        headers: {
          "x-test-user-id": "user-1",
        },
      }),
    );
    const getBookingPayload =
      (await getBookingResponse.json()) as BookingPayload;

    expect(getBookingResponse.status).toBe(200);
    expect(getBookingPayload.booking.prescriptionId).toBe(
      "55555555-5555-4555-8555-555555555555",
    );

    const updateBookingResponse = await getTestContext().app.handle(
      new Request(`http://localhost/api/v1/bookings/${bookingId}`, {
        body: JSON.stringify({
          notes: "Updated booking instructions",
          title: "Updated blood panel booking",
        }),
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "user-1",
        },
        method: "PATCH",
      }),
    );
    const updateBookingPayload =
      (await updateBookingResponse.json()) as BookingPayload;

    expect(updateBookingResponse.status).toBe(200);
    expect(updateBookingPayload.booking.notes).toBe(
      "Updated booking instructions",
    );
    expect(updateBookingPayload.booking.title).toBe(
      "Updated blood panel booking",
    );

    const listBookingsResponse = await getTestContext().app.handle(
      new Request(
        `http://localhost/api/v1/patients/11111111-1111-4111-8111-111111111111/bookings?search=blood&prescriptionType=exam&subtype=Blood%20panel&facilityId=${facilityId}&from=2026-04-01T00:00:00.000Z&to=2026-04-30T23:59:59.000Z&page=1&pageSize=10`,
        {
          headers: {
            "x-test-user-id": "user-1",
          },
        },
      ),
    );
    const listBookingsPayload =
      (await listBookingsResponse.json()) as BookingListPayload;

    expect(listBookingsResponse.status).toBe(200);
    expect(listBookingsPayload.bookings).toHaveLength(1);
    expect(listBookingsPayload.bookings[0]?.id).toBe(bookingId);
    expect(listBookingsPayload.pagination).toEqual({
      page: 1,
      pageSize: 10,
      total: 1,
      totalPages: 1,
    });

    await insertCareEvent(
      getTestContext().sql,
      getTestContext().schemaName,
      "11111111-1111-4111-8111-111111111111",
      bookingId,
    );

    const incompleteBookingsResponse = await getTestContext().app.handle(
      new Request(
        `http://localhost/api/v1/patients/11111111-1111-4111-8111-111111111111/bookings?hideCompleted=true&search=blood&prescriptionType=exam&subtype=Blood%20panel&facilityId=${facilityId}&from=2026-04-01T00:00:00.000Z&to=2026-04-30T23:59:59.000Z&page=1&pageSize=10`,
        {
          headers: {
            "x-test-user-id": "user-1",
          },
        },
      ),
    );
    const incompleteBookingsPayload =
      (await incompleteBookingsResponse.json()) as BookingListPayload;

    expect(incompleteBookingsResponse.status).toBe(200);
    expect(incompleteBookingsPayload.bookings).toHaveLength(0);
    expect(incompleteBookingsPayload.pagination.total).toBe(0);

    const deleteBookingResponse = await getTestContext().app.handle(
      new Request(`http://localhost/api/v1/bookings/${bookingId}`, {
        headers: {
          "x-test-user-id": "user-1",
        },
        method: "DELETE",
      }),
    );
    const deleteBookingPayload =
      (await deleteBookingResponse.json()) as BookingPayload;

    expect(deleteBookingResponse.status).toBe(200);
    expect(deleteBookingPayload.booking.id).toBe(bookingId);
    expect(deleteBookingPayload.booking.deletedAt).not.toBeNull();

    const activeListAfterDeleteResponse = await getTestContext().app.handle(
      new Request(
        `http://localhost/api/v1/patients/11111111-1111-4111-8111-111111111111/bookings?search=blood&prescriptionType=exam&subtype=Blood%20panel&facilityId=${facilityId}&from=2026-04-01T00:00:00.000Z&to=2026-04-30T23:59:59.000Z&page=1&pageSize=10`,
        {
          headers: {
            "x-test-user-id": "user-1",
          },
        },
      ),
    );
    const activeListAfterDeletePayload =
      (await activeListAfterDeleteResponse.json()) as BookingListPayload;

    expect(activeListAfterDeleteResponse.status).toBe(200);
    expect(activeListAfterDeletePayload.bookings).toHaveLength(0);

    const archivedListResponse = await getTestContext().app.handle(
      new Request(
        `http://localhost/api/v1/patients/11111111-1111-4111-8111-111111111111/bookings?includeArchived=true&search=blood&prescriptionType=exam&subtype=Blood%20panel&facilityId=${facilityId}&from=2026-04-01T00:00:00.000Z&to=2026-04-30T23:59:59.000Z&page=1&pageSize=10`,
        {
          headers: {
            "x-test-user-id": "user-1",
          },
        },
      ),
    );
    const archivedListPayload =
      (await archivedListResponse.json()) as BookingListPayload;

    expect(archivedListResponse.status).toBe(200);
    expect(archivedListPayload.bookings).toHaveLength(1);
    expect(archivedListPayload.bookings[0]?.id).toBe(bookingId);
    expect(archivedListPayload.bookings[0]?.deletedAt).not.toBeNull();
  });

  it("autofills the title from linked prescription type and subtype when omitted", async () => {
    const createResponse = await getTestContext().app.handle(
      new Request(
        "http://localhost/api/v1/patients/11111111-1111-4111-8111-111111111111/bookings",
        {
          body: JSON.stringify({
            prescriptionId: "55555555-5555-4555-8555-555555555555",
          }),
          headers: {
            "content-type": "application/json",
            "x-test-user-id": "user-1",
          },
          method: "POST",
        },
      ),
    );
    const createPayload = (await createResponse.json()) as BookingPayload;

    expect(createResponse.status).toBe(200);
    expect(createPayload.booking.title).toBe("exam - Blood panel");
  });

  it("rejects cross-patient booking links", async () => {
    const response = await getTestContext().app.handle(
      new Request(
        "http://localhost/api/v1/patients/11111111-1111-4111-8111-111111111111/bookings",
        {
          body: JSON.stringify({
            prescriptionId: "66666666-6666-4666-8666-666666666666",
            title: "Cross-patient booking",
          }),
          headers: {
            "content-type": "application/json",
            "x-test-user-id": "user-1",
          },
          method: "POST",
        },
      ),
    );
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload).toEqual({
      error: "patient_not_found",
      message: "Patient not found.",
    });
  });
});
