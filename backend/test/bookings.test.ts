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
  "postgres://postgres:postgres@localhost:5432/medical_manager";

const migrationDirectory = path.join(import.meta.dir, "../src/db/migrations");

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
    status: string;
    taskId: string;
  };
};

type BookingListPayload = {
  bookings: Array<BookingPayload["booking"]>;
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
    [taskId, patientId, "Seeded task", "visit_booking"],
  );
};

const insertPrescription = async (
  sql: postgres.Sql,
  schemaName: string,
  patientId: string,
  taskId: string,
  prescriptionId: string,
): Promise<void> => {
  await sql.unsafe(
    `
      insert into "${schemaName}"."prescriptions" (
        id,
        patient_id,
        task_id,
        prescription_type,
        status
      )
      values ($1, $2, $3, 'exam', 'requested')
    `,
    [prescriptionId, patientId, taskId],
  );
};

beforeEach(async () => {
  const schemaName = `test_bookings_${randomUUID().replaceAll("-", "")}`;
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
  await insertPrescription(
    sql,
    schemaName,
    "11111111-1111-4111-8111-111111111111",
    "33333333-3333-4333-8333-333333333333",
    "55555555-5555-4555-8555-555555555555",
  );
  await insertPrescription(
    sql,
    schemaName,
    "22222222-2222-4222-8222-222222222222",
    "44444444-4444-4444-8444-444444444444",
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

  it("creates facilities and supports booking CRUD with status transitions", async () => {
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
            status: "booking_in_progress",
            taskId: "33333333-3333-4333-8333-333333333333",
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
    expect(createBookingPayload.booking.status).toBe("booking_in_progress");
    expect(createBookingPayload.booking.facilityId).toBe(facilityId);

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
    expect(getBookingPayload.booking.taskId).toBe(
      "33333333-3333-4333-8333-333333333333",
    );

    const updateBookingResponse = await getTestContext().app.handle(
      new Request(`http://localhost/api/v1/bookings/${bookingId}`, {
        body: JSON.stringify({
          notes: "Updated booking instructions",
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

    const statusResponse = await getTestContext().app.handle(
      new Request(`http://localhost/api/v1/bookings/${bookingId}/status`, {
        body: JSON.stringify({
          status: "booked",
        }),
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "user-1",
        },
        method: "POST",
      }),
    );
    const statusPayload = (await statusResponse.json()) as BookingPayload;

    expect(statusResponse.status).toBe(200);
    expect(statusPayload.booking.status).toBe("booked");
    expect(statusPayload.booking.bookedAt).not.toBeNull();

    const listBookingsResponse = await getTestContext().app.handle(
      new Request(
        `http://localhost/api/v1/patients/11111111-1111-4111-8111-111111111111/bookings?status=booked&facilityId=${facilityId}&from=2026-04-01T00:00:00.000Z&to=2026-04-30T23:59:59.000Z`,
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
  });

  it("rejects invalid booking transitions", async () => {
    const createResponse = await getTestContext().app.handle(
      new Request(
        "http://localhost/api/v1/patients/11111111-1111-4111-8111-111111111111/bookings",
        {
          body: JSON.stringify({
            taskId: "33333333-3333-4333-8333-333333333333",
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

    const response = await getTestContext().app.handle(
      new Request(
        `http://localhost/api/v1/bookings/${createPayload.booking.id}/status`,
        {
          body: JSON.stringify({
            status: "completed",
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

    expect(response.status).toBe(409);
    expect(payload).toEqual({
      error: "invalid_booking_status_transition",
      message: "Booking status transition is not allowed.",
    });
  });

  it("rejects cross-patient booking links", async () => {
    const response = await getTestContext().app.handle(
      new Request(
        "http://localhost/api/v1/patients/11111111-1111-4111-8111-111111111111/bookings",
        {
          body: JSON.stringify({
            prescriptionId: "66666666-6666-4666-8666-666666666666",
            taskId: "33333333-3333-4333-8333-333333333333",
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
