import type { Sql } from "postgres";

import {
  databaseSchemaName,
  qualifyTableName,
  quoteIdentifier,
} from "../../db/schema";
import type { CreateFacilityInput } from "../facilities/repository";
import type { PrescriptionType } from "../prescriptions/repository";

export type BookingRecord = {
  appointment_at: Date | null;
  booked_at: Date | null;
  created_at: Date;
  deleted_at: Date | null;
  facility_id: string | null;
  id: string;
  notes: string | null;
  patient_id: string;
  prescription_id: string | null;
  title: string;
  updated_at: Date;
};

export type BookingListFilters = {
  facilityId?: string;
  from?: string;
  includeArchived: boolean;
  page: number;
  pageSize: number;
  prescriptionId?: string;
  prescriptionType?: PrescriptionType;
  search?: string;
  subtype?: string;
  to?: string;
};

export type BookingListResult = {
  items: BookingRecord[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type CreateBookingInput = {
  appointmentAt: string | null;
  bookedAt: string | null;
  facility?: CreateFacilityInput | null;
  facilityId: string | null;
  notes: string | null;
  prescriptionId: string | null;
  title: string | null;
};

export type UpdateBookingInput = Partial<CreateBookingInput>;

const patientsTable = (schemaName: string): string =>
  qualifyTableName(schemaName, "patients");

const patientUsersTable = (schemaName: string): string =>
  qualifyTableName(schemaName, "patient_users");

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
  const qualifiedPrescriptionsTable = prescriptionsTable(schemaName);
  const qualifiedFacilitiesTable = facilitiesTable(schemaName);
  const qualifiedBookingsTable = bookingsTable(schemaName);
  const qualifiedPrescriptionType = qualifyTypeName(
    schemaName,
    "prescription_type",
  );
  const bookingColumns = `
    b.id,
    b.patient_id,
    b.prescription_id,
    b.facility_id,
    b.title,
    b.booked_at,
    b.appointment_at,
    b.notes,
    b.deleted_at,
    b.created_at,
    b.updated_at
  `;
  const insertFacility = async (
    executor: Pick<Sql, "unsafe">,
    input: CreateFacilityInput,
  ): Promise<string> => {
    const [facility] = await executor.unsafe<Array<{ id: string }>>(
      `
        insert into ${qualifiedFacilitiesTable} (
          name,
          facility_type,
          address,
          city,
          notes
        )
        values ($1, $2, $3, $4, $5)
        returning id
      `,
      [input.name, input.facilityType, input.address, input.city, input.notes],
    );

    if (!facility) {
      throw new Error("FACILITY_CREATE_FAILED");
    }

    return facility.id;
  };

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
        input.prescriptionId,
        input.facility ? null : input.facilityId,
      );

      if (!linksAreValid) {
        return null;
      }

      const bookingId = await sql.begin(async (transaction) => {
        const facilityId = input.facility
          ? await insertFacility(transaction, input.facility)
          : input.facilityId;

        const [booking] = await transaction.unsafe<Array<{ id: string }>>(
          `
            insert into ${qualifiedBookingsTable} (
              patient_id,
              prescription_id,
              facility_id,
              title,
              booked_at,
              appointment_at,
              notes
            )
            values (
              $1,
              $2,
              $3,
              coalesce(
                $4,
                (
                  select concat_ws(
                    ' - ',
                    p.prescription_type::text,
                    nullif(btrim(p.subtype), '')
                  )
                  from ${qualifiedPrescriptionsTable} as p
                  where p.id = $2
                    and p.patient_id = $1
                ),
                'Booking'
              ),
              $5,
              $6,
              $7
            )
            returning id
          `,
          [
            patientId,
            input.prescriptionId,
            facilityId,
            input.title,
            input.bookedAt,
            input.appointmentAt,
            input.notes,
          ],
        );

        return booking?.id ?? null;
      });

      if (!bookingId) {
        return null;
      }

      return this.findAccessibleById(userId, bookingId);
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

    async deleteAccessible(
      userId: string,
      bookingId: string,
    ): Promise<BookingRecord | null> {
      const existingBooking = await this.findAccessibleById(userId, bookingId);

      if (!existingBooking) {
        return null;
      }

      const [deletedBooking] = await sql.unsafe<Array<{ id: string }>>(
        `
          update ${qualifiedBookingsTable}
          set
            deleted_at = coalesce(deleted_at, now()),
            updated_at = now()
          where id = $1
          returning id
        `,
        [bookingId],
      );

      if (!deletedBooking) {
        return null;
      }

      return this.findAccessibleById(userId, deletedBooking.id);
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
      prescriptionId: string | null,
      facilityId: string | null,
    ): Promise<boolean> {
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
    ): Promise<BookingListResult | null> {
      const hasAccess = await this.hasPatientAccess(userId, patientId);

      if (!hasAccess) {
        return null;
      }

      const search = filters.search?.trim().toLowerCase() ?? null;
      const subtype = filters.subtype?.trim().toLowerCase() ?? null;
      const offset = (filters.page - 1) * filters.pageSize;
      const filterParams = [
        patientId,
        filters.includeArchived,
        filters.facilityId ?? null,
        filters.prescriptionId ?? null,
        filters.prescriptionType ?? null,
        search,
        subtype,
        filters.from ?? null,
        filters.to ?? null,
      ];
      const fromClause = `
        from ${qualifiedBookingsTable} as b
        left join ${qualifiedPrescriptionsTable} as p
          on p.id = b.prescription_id
        left join ${qualifiedFacilitiesTable} as f
          on f.id = b.facility_id
      `;
      const whereClause = `
        b.patient_id = $1
        and ($2 or b.deleted_at is null)
        and ($3::uuid is null or b.facility_id = $3::uuid)
        and ($4::uuid is null or b.prescription_id = $4::uuid)
        and ($5::${qualifiedPrescriptionType} is null or p.prescription_type = $5::${qualifiedPrescriptionType})
        and (
          $6::text is null
          or lower(coalesce(b.title, '')) like '%' || $6 || '%'
          or lower(coalesce(b.notes, '')) like '%' || $6 || '%'
          or lower(coalesce(f.name, '')) like '%' || $6 || '%'
          or lower(coalesce(f.city, '')) like '%' || $6 || '%'
          or lower(coalesce(p.subtype, '')) like '%' || $6 || '%'
          or p.prescription_type::text like '%' || $6 || '%'
        )
        and ($7::text is null or lower(coalesce(p.subtype, '')) = $7)
        and ($8::timestamptz is null or coalesce(b.appointment_at, b.booked_at) >= $8::timestamptz)
        and ($9::timestamptz is null or coalesce(b.appointment_at, b.booked_at) <= $9::timestamptz)
      `;

      const [countResult] = await sql.unsafe<Array<{ total: string }>>(
        `
          select count(*)::text as total
          ${fromClause}
          where ${whereClause}
        `,
        filterParams,
      );

      const items = await sql.unsafe<BookingRecord[]>(
        `
          select
            ${bookingColumns}
          ${fromClause}
          where ${whereClause}
          order by
            b.deleted_at asc nulls first,
            b.appointment_at asc nulls last,
            b.booked_at asc nulls last,
            lower(b.title) asc,
            b.created_at asc,
            b.id asc
          limit $10
          offset $11
        `,
        [...filterParams, filters.pageSize, offset],
      );

      const total = Number.parseInt(countResult?.total ?? "0", 10);

      return {
        items,
        page: filters.page,
        pageSize: filters.pageSize,
        total,
        totalPages: Math.ceil(total / filters.pageSize),
      };
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

      const prescriptionId =
        input.prescriptionId === undefined
          ? existingBooking.prescription_id
          : input.prescriptionId;
      const facilityId =
        input.facilityId === undefined
          ? existingBooking.facility_id
          : input.facilityId;
      const title =
        input.title === undefined ? existingBooking.title : input.title;

      const linksAreValid = await this.hasValidLinks(
        existingBooking.patient_id,
        prescriptionId,
        input.facility ? null : facilityId,
      );

      if (!linksAreValid) {
        return null;
      }

      const updatedBookingId = await sql.begin(async (transaction) => {
        const resolvedFacilityId = input.facility
          ? await insertFacility(transaction, input.facility)
          : facilityId;

        const [booking] = await transaction.unsafe<Array<{ id: string }>>(
          `
            update ${qualifiedBookingsTable}
            set
              prescription_id = $1,
              facility_id = $2,
              title = coalesce($3, title),
              booked_at = $4,
              appointment_at = $5,
              notes = $6,
              updated_at = now()
            where id = $7
            returning id
          `,
          [
            prescriptionId,
            resolvedFacilityId,
            title,
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

        return booking?.id ?? null;
      });

      if (!updatedBookingId) {
        return null;
      }

      return this.findAccessibleById(userId, updatedBookingId);
    },
  };
};

export type BookingsRepository = ReturnType<typeof createBookingsRepository>;
