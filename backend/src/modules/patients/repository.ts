import type { Sql } from "postgres";

import { databaseSchemaName, qualifyTableName } from "../../db/schema";

type PatientListFilters = {
  includeArchived: boolean;
  search?: string;
};

export type PatientRecord = {
  created_at: Date;
  date_of_birth: Date | string | null;
  deleted_at: Date | null;
  full_name: string;
  id: string;
  notes: string | null;
  updated_at: Date;
};

export type PatientOverviewAppointmentRecord = {
  appointment_at: Date;
  booking_id: string;
  booking_status: string;
  facility_id: string | null;
  prescription_id: string | null;
};

export type PatientOverviewPrescriptionRecord = {
  expiration_date: Date | string | null;
  issue_date: Date | string | null;
  notes: string | null;
  prescription_id: string;
  prescription_type: string;
  status: string;
};

export type PatientOverviewRecord = {
  pending_prescriptions: PatientOverviewPrescriptionRecord[];
  upcoming_appointments: PatientOverviewAppointmentRecord[];
};

export type PatientUserRecord = {
  created_at: Date;
  email: string;
  full_name: string;
  id: string;
};

export type CreatePatientInput = {
  dateOfBirth: string | null;
  fullName: string;
  notes: string | null;
};

export type UpdatePatientInput = Partial<CreatePatientInput>;

const patientsTable = (schemaName: string): string =>
  qualifyTableName(schemaName, "patients");

const patientUsersTable = (schemaName: string): string =>
  qualifyTableName(schemaName, "patient_users");

const prescriptionsTable = (schemaName: string): string =>
  qualifyTableName(schemaName, "prescriptions");

const bookingsTable = (schemaName: string): string =>
  qualifyTableName(schemaName, "bookings");

const usersTable = (schemaName: string): string =>
  qualifyTableName(schemaName, "user");

export const createPatientsRepository = (
  sql: Sql,
  schemaName = databaseSchemaName,
) => {
  const qualifiedPatientsTable = patientsTable(schemaName);
  const qualifiedPatientUsersTable = patientUsersTable(schemaName);
  const qualifiedPrescriptionsTable = prescriptionsTable(schemaName);
  const qualifiedBookingsTable = bookingsTable(schemaName);
  const qualifiedUsersTable = usersTable(schemaName);
  return {
    async create(
      userId: string,
      input: CreatePatientInput,
    ): Promise<PatientRecord> {
      return sql.begin(async (transaction) => {
        const [patient] = await transaction.unsafe<[PatientRecord]>(
          `
            insert into ${qualifiedPatientsTable} (
              full_name,
              date_of_birth,
              notes
            )
            values ($1, $2, $3)
            returning id, full_name, date_of_birth, notes, deleted_at, created_at, updated_at
          `,
          [input.fullName, input.dateOfBirth, input.notes],
        );

        await transaction.unsafe(
          `
            insert into ${qualifiedPatientUsersTable} (
              patient_id,
              user_id
            )
            values ($1, $2)
          `,
          [patient.id, userId],
        );

        return patient;
      });
    },

    async findAccessibleById(
      userId: string,
      patientId: string,
    ): Promise<PatientRecord | null> {
      const [patient] = await sql.unsafe<[PatientRecord]>(
        `
          select
            p.id,
            p.full_name,
            p.date_of_birth,
            p.notes,
            p.deleted_at,
            p.created_at,
            p.updated_at
          from ${qualifiedPatientsTable} as p
          inner join ${qualifiedPatientUsersTable} as pu
            on pu.patient_id = p.id
          where pu.user_id = $1
            and p.id = $2
          limit 1
        `,
        [userId, patientId],
      );

      return patient ?? null;
    },

    async listAccessible(
      userId: string,
      filters: PatientListFilters,
    ): Promise<PatientRecord[]> {
      const searchTerm = filters.search?.trim() || null;

      return sql.unsafe<PatientRecord[]>(
        `
          select
            p.id,
            p.full_name,
            p.date_of_birth,
            p.notes,
            p.deleted_at,
            p.created_at,
            p.updated_at
          from ${qualifiedPatientsTable} as p
          inner join ${qualifiedPatientUsersTable} as pu
            on pu.patient_id = p.id
          where pu.user_id = $1
            and ($2 or p.deleted_at is null)
            and ($3::text is null or p.full_name ilike '%' || $3 || '%')
          order by lower(p.full_name) asc, p.created_at asc
        `,
        [userId, filters.includeArchived, searchTerm],
      );
    },

    async listAccessibleUsers(
      userId: string,
      patientId: string,
    ): Promise<PatientUserRecord[] | null> {
      const hasAccess = await this.findAccessibleById(userId, patientId);

      if (!hasAccess) {
        return null;
      }

      return sql.unsafe<PatientUserRecord[]>(
        `
          select
            u.id,
            u.name as full_name,
            u.email,
            pu.created_at
          from ${qualifiedPatientUsersTable} as pu
          inner join ${qualifiedUsersTable} as u
            on u.id = pu.user_id
          where pu.patient_id = $1
          order by lower(u.name) asc, lower(u.email) asc, pu.created_at asc
        `,
        [patientId],
      );
    },

    async addAccessibleUser(
      userId: string,
      patientId: string,
      identifier: string,
    ): Promise<PatientUserRecord | "duplicate" | "user_not_found" | null> {
      const existingPatient = await this.findAccessibleById(userId, patientId);

      if (!existingPatient) {
        return null;
      }

      const normalizedIdentifier = identifier.trim();
      const [targetUser] = await sql.unsafe<
        Array<{
          email: string;
          full_name: string;
          id: string;
        }>
      >(
        `
          select
            u.id,
            u.name as full_name,
            u.email
          from ${qualifiedUsersTable} as u
          where u.id = $1
             or lower(u.email) = lower($1)
          limit 1
        `,
        [normalizedIdentifier],
      );

      if (!targetUser) {
        return "user_not_found";
      }

      const [membership] = await sql.unsafe<Array<{ created_at: Date }>>(
        `
          insert into ${qualifiedPatientUsersTable} (
            patient_id,
            user_id
          )
          values ($1, $2)
          on conflict (patient_id, user_id) do nothing
          returning created_at
        `,
        [patientId, targetUser.id],
      );

      if (!membership) {
        return "duplicate";
      }

      return {
        created_at: membership.created_at,
        email: targetUser.email,
        full_name: targetUser.full_name,
        id: targetUser.id,
      };
    },

    async findAccessibleOverviewById(
      userId: string,
      patientId: string,
    ): Promise<PatientOverviewRecord | null> {
      const hasAccess = await this.findAccessibleById(userId, patientId);

      if (!hasAccess) {
        return null;
      }

      const [upcomingAppointments, pendingPrescriptions] = await Promise.all([
        sql.unsafe<PatientOverviewAppointmentRecord[]>(
          `
            select
              b.id as booking_id,
              b.prescription_id,
              b.facility_id,
              b.booking_status,
              b.appointment_at
            from ${qualifiedBookingsTable} as b
            where b.patient_id = $1
              and b.deleted_at is null
              and b.booking_status not in ('completed', 'cancelled')
              and b.appointment_at is not null
              and b.appointment_at >= now()
            order by b.appointment_at asc
            limit 5
        `,
          [patientId],
        ),
        sql.unsafe<PatientOverviewPrescriptionRecord[]>(
          `
            select
              p.id as prescription_id,
              p.prescription_type,
              p.status,
              p.issue_date,
              p.expiration_date,
              p.notes
            from ${qualifiedPrescriptionsTable} as p
            where p.patient_id = $1
              and p.deleted_at is null
              and p.status in ('needed', 'requested', 'available')
            order by
              case p.status
                when 'needed' then 0
                when 'requested' then 1
                when 'available' then 2
                else 3
              end,
              p.created_at asc
            limit 5
        `,
          [patientId],
        ),
      ]);

      return {
        pending_prescriptions: pendingPrescriptions,
        upcoming_appointments: upcomingAppointments,
      };
    },

    async removeAccessibleUser(
      userId: string,
      patientId: string,
      targetUserId: string,
    ): Promise<PatientUserRecord | "membership_not_found" | null> {
      const existingPatient = await this.findAccessibleById(userId, patientId);

      if (!existingPatient) {
        return null;
      }

      const [membership] = await sql.unsafe<[PatientUserRecord]>(
        `
          delete from ${qualifiedPatientUsersTable} as pu
          using ${qualifiedUsersTable} as u
          where pu.patient_id = $1
            and pu.user_id = $2
            and u.id = pu.user_id
          returning
            u.id,
            u.name as full_name,
            u.email,
            pu.created_at
        `,
        [patientId, targetUserId],
      );

      return membership ?? "membership_not_found";
    },

    async updateAccessible(
      userId: string,
      patientId: string,
      input: UpdatePatientInput,
    ): Promise<PatientRecord | null> {
      const existingPatient = await this.findAccessibleById(userId, patientId);

      if (!existingPatient) {
        return null;
      }

      const [patient] = await sql.unsafe<[PatientRecord]>(
        `
          update ${qualifiedPatientsTable}
          set
            full_name = $1,
            date_of_birth = $2,
            notes = $3,
            updated_at = now()
          where id = $4
          returning id, full_name, date_of_birth, notes, deleted_at, created_at, updated_at
        `,
        [
          input.fullName ?? existingPatient.full_name,
          input.dateOfBirth === undefined
            ? existingPatient.date_of_birth
            : input.dateOfBirth,
          input.notes === undefined ? existingPatient.notes : input.notes,
          patientId,
        ],
      );

      return patient ?? null;
    },

    async setArchivedState(
      userId: string,
      patientId: string,
      archived: boolean,
    ): Promise<PatientRecord | null> {
      const existingPatient = await this.findAccessibleById(userId, patientId);

      if (!existingPatient) {
        return null;
      }

      const [patient] = await sql.unsafe<[PatientRecord]>(
        `
          update ${qualifiedPatientsTable}
          set
            deleted_at = ${archived ? "now()" : "null"},
            updated_at = now()
          where id = $1
          returning id, full_name, date_of_birth, notes, deleted_at, created_at, updated_at
        `,
        [patientId],
      );

      return patient ?? null;
    },
  };
};

export type PatientsRepository = ReturnType<typeof createPatientsRepository>;
