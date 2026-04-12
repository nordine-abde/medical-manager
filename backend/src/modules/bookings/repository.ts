import type { Sql } from "postgres";

import {
  databaseSchemaName,
  qualifyTableName,
  quoteIdentifier,
} from "../../db/schema";

export const bookingStatuses = [
  "not_booked",
  "booking_in_progress",
  "booked",
  "completed",
  "cancelled",
] as const;

export type BookingStatus = (typeof bookingStatuses)[number];

export type BookingRecord = {
  appointment_at: Date | null;
  booked_at: Date | null;
  booking_status: BookingStatus;
  created_at: Date;
  deleted_at: Date | null;
  facility_id: string | null;
  id: string;
  notes: string | null;
  patient_id: string;
  prescription_id: string | null;
  task_id: string;
  updated_at: Date;
};

export type BookingListFilters = {
  facilityId?: string;
  from?: string;
  includeArchived: boolean;
  status?: BookingStatus;
  to?: string;
};

export type CreateBookingInput = {
  appointmentAt: string | null;
  bookedAt: string | null;
  facilityId: string | null;
  notes: string | null;
  prescriptionId: string | null;
  status: BookingStatus;
  taskId: string;
};

export type UpdateBookingInput = Partial<Omit<CreateBookingInput, "status">>;

export type UpdateBookingStatusInput = {
  appointmentAt: string | null;
  bookedAt: string | null;
  status: BookingStatus;
};

const patientsTable = (schemaName: string): string =>
  qualifyTableName(schemaName, "patients");

const patientUsersTable = (schemaName: string): string =>
  qualifyTableName(schemaName, "patient_users");

const tasksTable = (schemaName: string): string =>
  qualifyTableName(schemaName, "tasks");

const prescriptionsTable = (schemaName: string): string =>
  qualifyTableName(schemaName, "prescriptions");

const facilitiesTable = (schemaName: string): string =>
  qualifyTableName(schemaName, "facilities");

const bookingsTable = (schemaName: string): string =>
  qualifyTableName(schemaName, "bookings");

const qualifyTypeName = (schemaName: string, typeName: string): string =>
  `${quoteIdentifier(schemaName)}.${quoteIdentifier(typeName)}`;

export const createBookingsRepository = (
  sql: Sql,
  schemaName = databaseSchemaName,
) => {
  const qualifiedPatientsTable = patientsTable(schemaName);
  const qualifiedPatientUsersTable = patientUsersTable(schemaName);
  const qualifiedTasksTable = tasksTable(schemaName);
  const qualifiedPrescriptionsTable = prescriptionsTable(schemaName);
  const qualifiedFacilitiesTable = facilitiesTable(schemaName);
  const qualifiedBookingsTable = bookingsTable(schemaName);
  const qualifiedBookingStatusType = qualifyTypeName(
    schemaName,
    "booking_status",
  );
  const bookingColumns = `
    b.id,
    b.patient_id,
    b.task_id,
    b.prescription_id,
    b.facility_id,
    b.booking_status,
    b.booked_at,
    b.appointment_at,
    b.notes,
    b.deleted_at,
    b.created_at,
    b.updated_at
  `;

  return {
    async create(
      userId: string,
      patientId: string,
      input: CreateBookingInput,
    ): Promise<BookingRecord | null> {
      const hasAccess = await this.hasPatientAccess(userId, patientId);

      if (!hasAccess) {
        return null;
      }

      const linksAreValid = await this.hasValidLinks(
        patientId,
        input.taskId,
        input.prescriptionId,
        input.facilityId,
      );

      if (!linksAreValid) {
        return null;
      }

      const [booking] = await sql.unsafe<Array<{ id: string }>>(
        `
          insert into ${qualifiedBookingsTable} (
            patient_id,
            task_id,
            prescription_id,
            facility_id,
            booking_status,
            booked_at,
            appointment_at,
            notes
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8)
          returning id
        `,
        [
          patientId,
          input.taskId,
          input.prescriptionId,
          input.facilityId,
          input.status,
          input.bookedAt,
          input.appointmentAt,
          input.notes,
        ],
      );

      if (!booking) {
        return null;
      }

      return this.findAccessibleById(userId, booking.id);
    },

    async findAccessibleById(
      userId: string,
      bookingId: string,
    ): Promise<BookingRecord | null> {
      const [booking] = await sql.unsafe<[BookingRecord]>(
        `
          select
            ${bookingColumns}
          from ${qualifiedBookingsTable} as b
          inner join ${qualifiedPatientUsersTable} as pu
            on pu.patient_id = b.patient_id
          where pu.user_id = $1
            and b.id = $2
          limit 1
        `,
        [userId, bookingId],
      );

      return booking ?? null;
    },

    async hasPatientAccess(
      userId: string,
      patientId: string,
    ): Promise<boolean> {
      const [result] = await sql.unsafe<Array<{ id: string }>>(
        `
          select p.id
          from ${qualifiedPatientsTable} as p
          inner join ${qualifiedPatientUsersTable} as pu
            on pu.patient_id = p.id
          where pu.user_id = $1
            and p.id = $2
          limit 1
        `,
        [userId, patientId],
      );

      return result !== undefined;
    },

    async hasValidLinks(
      patientId: string,
      taskId: string,
      prescriptionId: string | null,
      facilityId: string | null,
    ): Promise<boolean> {
      const [task] = await sql.unsafe<Array<{ id: string }>>(
        `
          select t.id
          from ${qualifiedTasksTable} as t
          where t.id = $1
            and t.patient_id = $2
          limit 1
        `,
        [taskId, patientId],
      );

      if (!task) {
        return false;
      }

      if (prescriptionId) {
        const [prescription] = await sql.unsafe<Array<{ id: string }>>(
          `
            select p.id
            from ${qualifiedPrescriptionsTable} as p
            where p.id = $1
              and p.patient_id = $2
            limit 1
          `,
          [prescriptionId, patientId],
        );

        if (!prescription) {
          return false;
        }
      }

      if (facilityId) {
        const [facility] = await sql.unsafe<Array<{ id: string }>>(
          `
            select f.id
            from ${qualifiedFacilitiesTable} as f
            where f.id = $1
            limit 1
          `,
          [facilityId],
        );

        if (!facility) {
          return false;
        }
      }

      return true;
    },

    async listByPatient(
      userId: string,
      patientId: string,
      filters: BookingListFilters,
    ): Promise<BookingRecord[] | null> {
      const hasAccess = await this.hasPatientAccess(userId, patientId);

      if (!hasAccess) {
        return null;
      }

      return sql.unsafe<BookingRecord[]>(
        `
          select
            ${bookingColumns}
          from ${qualifiedBookingsTable} as b
          where b.patient_id = $1
            and ($2 or b.deleted_at is null)
            and ($3::${qualifiedBookingStatusType} is null or b.booking_status = $3::${qualifiedBookingStatusType})
            and ($4::timestamptz is null or b.appointment_at >= $4::timestamptz)
            and ($5::timestamptz is null or b.appointment_at <= $5::timestamptz)
            and ($6::uuid is null or b.facility_id = $6::uuid)
          order by
            b.deleted_at asc nulls first,
            b.appointment_at asc nulls last,
            b.booked_at asc nulls last,
            b.created_at asc
        `,
        [
          patientId,
          filters.includeArchived,
          filters.status ?? null,
          filters.from ?? null,
          filters.to ?? null,
          filters.facilityId ?? null,
        ],
      );
    },

    async updateAccessible(
      userId: string,
      bookingId: string,
      input: UpdateBookingInput,
    ): Promise<BookingRecord | null> {
      const existingBooking = await this.findAccessibleById(userId, bookingId);

      if (!existingBooking) {
        return null;
      }

      const taskId = input.taskId ?? existingBooking.task_id;
      const prescriptionId =
        input.prescriptionId === undefined
          ? existingBooking.prescription_id
          : input.prescriptionId;
      const facilityId =
        input.facilityId === undefined
          ? existingBooking.facility_id
          : input.facilityId;

      const linksAreValid = await this.hasValidLinks(
        existingBooking.patient_id,
        taskId,
        prescriptionId,
        facilityId,
      );

      if (!linksAreValid) {
        return null;
      }

      const [booking] = await sql.unsafe<Array<{ id: string }>>(
        `
          update ${qualifiedBookingsTable}
          set
            task_id = $1,
            prescription_id = $2,
            facility_id = $3,
            booked_at = $4,
            appointment_at = $5,
            notes = $6,
            updated_at = now()
          where id = $7
          returning id
        `,
        [
          taskId,
          prescriptionId,
          facilityId,
          input.bookedAt === undefined
            ? existingBooking.booked_at
            : input.bookedAt,
          input.appointmentAt === undefined
            ? existingBooking.appointment_at
            : input.appointmentAt,
          input.notes === undefined ? existingBooking.notes : input.notes,
          bookingId,
        ],
      );

      if (!booking) {
        return null;
      }

      return this.findAccessibleById(userId, booking.id);
    },

    async updateStatusAccessible(
      userId: string,
      bookingId: string,
      input: UpdateBookingStatusInput,
    ): Promise<BookingRecord | null> {
      const existingBooking = await this.findAccessibleById(userId, bookingId);

      if (!existingBooking || existingBooking.deleted_at) {
        return null;
      }

      const [booking] = await sql.unsafe<Array<{ id: string }>>(
        `
          update ${qualifiedBookingsTable}
          set
            booking_status = $1,
            booked_at = $2,
            appointment_at = $3,
            updated_at = now()
          where id = $4
          returning id
        `,
        [input.status, input.bookedAt, input.appointmentAt, bookingId],
      );

      if (!booking) {
        return null;
      }

      return this.findAccessibleById(userId, booking.id);
    },
  };
};

export type BookingsRepository = ReturnType<typeof createBookingsRepository>;
