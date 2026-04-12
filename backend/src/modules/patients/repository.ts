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
  task_id: string;
};

export type PatientOverviewPrescriptionRecord = {
  expiration_date: Date | string | null;
  issue_date: Date | string | null;
  notes: string | null;
  prescription_id: string;
  prescription_type: string;
  status: string;
  task_id: string | null;
};

export type PatientOverviewConditionRecord = {
  condition_id: string;
  name: string;
  notes: string | null;
};

export type PatientOverviewMedicationRecord = {
  condition_name: string | null;
  medication_id: string;
  name: string;
  next_gp_contact_date: Date | string | null;
  quantity: string;
  renewal_cadence: string | null;
  renewal_task_due_date: Date | string | null;
  renewal_task_id: string | null;
  renewal_task_status: string | null;
  renewal_task_title: string | null;
};

export type PatientOverviewRecord = {
  active_conditions: PatientOverviewConditionRecord[];
  active_medications: PatientOverviewMedicationRecord[];
  overdue_task_count: number;
  pending_prescriptions: PatientOverviewPrescriptionRecord[];
  upcoming_appointments: PatientOverviewAppointmentRecord[];
};

export const patientTimelineEventTypes = [
  "task",
  "medical_instruction",
  "prescription",
  "booking",
  "care_event",
  "medication",
  "document",
] as const;

export type PatientTimelineEventType =
  (typeof patientTimelineEventTypes)[number];

export type PatientTimelineRecord = {
  event_date: Date;
  event_id: string;
  event_type: PatientTimelineEventType;
  patient_id: string;
  summary: string;
  timeline_id: string;
};

export type PatientTimelineFilters = {
  endDate?: string;
  eventType?: PatientTimelineEventType;
  startDate?: string;
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

const tasksTable = (schemaName: string): string =>
  qualifyTableName(schemaName, "tasks");

const conditionsTable = (schemaName: string): string =>
  qualifyTableName(schemaName, "conditions");

const prescriptionsTable = (schemaName: string): string =>
  qualifyTableName(schemaName, "prescriptions");

const bookingsTable = (schemaName: string): string =>
  qualifyTableName(schemaName, "bookings");

const medicationsTable = (schemaName: string): string =>
  qualifyTableName(schemaName, "medications");

const usersTable = (schemaName: string): string =>
  qualifyTableName(schemaName, "user");

const medicalInstructionsTable = (schemaName: string): string =>
  qualifyTableName(schemaName, "medical_instructions");

const careEventsTable = (schemaName: string): string =>
  qualifyTableName(schemaName, "care_events");

const documentsTable = (schemaName: string): string =>
  qualifyTableName(schemaName, "documents");

export const createPatientsRepository = (
  sql: Sql,
  schemaName = databaseSchemaName,
) => {
  const qualifiedPatientsTable = patientsTable(schemaName);
  const qualifiedPatientUsersTable = patientUsersTable(schemaName);
  const qualifiedTasksTable = tasksTable(schemaName);
  const qualifiedConditionsTable = conditionsTable(schemaName);
  const qualifiedPrescriptionsTable = prescriptionsTable(schemaName);
  const qualifiedBookingsTable = bookingsTable(schemaName);
  const qualifiedMedicationsTable = medicationsTable(schemaName);
  const qualifiedUsersTable = usersTable(schemaName);
  const qualifiedMedicalInstructionsTable =
    medicalInstructionsTable(schemaName);
  const qualifiedCareEventsTable = careEventsTable(schemaName);
  const qualifiedDocumentsTable = documentsTable(schemaName);

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

      const [
        overdueTaskCountRow,
        upcomingAppointments,
        pendingPrescriptions,
        activeConditions,
        activeMedications,
      ] = await Promise.all([
        sql.unsafe<Array<{ overdue_task_count: number | string }>>(
          `
              select count(*)::int as overdue_task_count
              from ${qualifiedTasksTable} as t
              where t.patient_id = $1
                and t.deleted_at is null
                and t.status not in ('blocked', 'completed', 'cancelled')
                and t.due_date is not null
                and t.due_date < current_date
          `,
          [patientId],
        ),
        sql.unsafe<PatientOverviewAppointmentRecord[]>(
          `
              select
                b.id as booking_id,
                b.task_id,
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
                p.task_id,
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
        sql.unsafe<PatientOverviewConditionRecord[]>(
          `
              select
                c.id as condition_id,
                c.name,
                c.notes
              from ${qualifiedConditionsTable} as c
              where c.patient_id = $1
                and c.active = true
              order by lower(c.name) asc, c.created_at asc
          `,
          [patientId],
        ),
        sql.unsafe<PatientOverviewMedicationRecord[]>(
          `
              select
                m.id as medication_id,
                m.name,
                m.quantity,
                m.renewal_cadence,
                m.next_gp_contact_date,
                c.name as condition_name,
                renewal_task.id as renewal_task_id,
                renewal_task.title as renewal_task_title,
                renewal_task.status as renewal_task_status,
                renewal_task.due_date as renewal_task_due_date
              from ${qualifiedMedicationsTable} as m
              left join ${qualifiedConditionsTable} as c
                on c.id = m.condition_id
               and c.patient_id = m.patient_id
              left join lateral (
                select
                  t.id,
                  t.title,
                  t.status,
                  t.due_date
                from ${qualifiedTasksTable} as t
                where t.patient_id = m.patient_id
                  and t.medication_id = m.id
                  and t.deleted_at is null
                  and t.task_type = 'medication_renewal'
                order by
                  case
                    when t.status in ('pending', 'scheduled', 'deferred', 'blocked') then 0
                    else 1
                  end,
                  t.due_date asc nulls last,
                  t.scheduled_at asc nulls last,
                  lower(t.title) asc,
                  t.created_at asc
                limit 1
              ) as renewal_task on true
              where m.patient_id = $1
                and m.deleted_at is null
              order by
                m.next_gp_contact_date asc nulls last,
                lower(m.name) asc,
                m.created_at asc
              limit 5
          `,
          [patientId],
        ),
      ]);

      return {
        active_conditions: activeConditions,
        active_medications: activeMedications,
        overdue_task_count: Number(
          overdueTaskCountRow?.at(0)?.overdue_task_count ?? 0,
        ),
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

    async listAccessibleTimeline(
      userId: string,
      patientId: string,
      filters: PatientTimelineFilters,
    ): Promise<PatientTimelineRecord[] | null> {
      const hasAccess = await this.findAccessibleById(userId, patientId);

      if (!hasAccess) {
        return null;
      }

      return sql.unsafe<PatientTimelineRecord[]>(
        `
          with timeline_events as (
            select
              ('task:' || t.id::text) as timeline_id,
              t.patient_id,
              t.id as event_id,
              'task'::text as event_type,
              coalesce(t.completed_at, t.scheduled_at, t.due_date::timestamp, t.created_at) as event_date,
              t.title as summary
            from ${qualifiedTasksTable} as t
            where t.patient_id = $1
              and t.deleted_at is null

            union all

            select
              ('medical_instruction:' || mi.id::text) as timeline_id,
              mi.patient_id,
              mi.id as event_id,
              'medical_instruction'::text as event_type,
              coalesce(mi.instruction_date::timestamp, mi.created_at) as event_date,
              coalesce(mi.doctor_name, 'Medical instruction') as summary
            from ${qualifiedMedicalInstructionsTable} as mi
            where mi.patient_id = $1

            union all

            select
              ('prescription:' || p.id::text) as timeline_id,
              p.patient_id,
              p.id as event_id,
              'prescription'::text as event_type,
              coalesce(
                p.collected_at,
                p.received_at,
                p.requested_at,
                p.issue_date::timestamp,
                p.created_at
              ) as event_date,
              ('Prescription: ' || p.prescription_type) as summary
            from ${qualifiedPrescriptionsTable} as p
            where p.patient_id = $1
              and p.deleted_at is null

            union all

            select
              ('booking:' || b.id::text) as timeline_id,
              b.patient_id,
              b.id as event_id,
              'booking'::text as event_type,
              coalesce(b.appointment_at, b.booked_at, b.created_at) as event_date,
              ('Booking: ' || b.booking_status) as summary
            from ${qualifiedBookingsTable} as b
            where b.patient_id = $1
              and b.deleted_at is null

            union all

            select
              ('care_event:' || ce.id::text) as timeline_id,
              ce.patient_id,
              ce.id as event_id,
              'care_event'::text as event_type,
              ce.completed_at as event_date,
              ('Care event: ' || ce.event_type) as summary
            from ${qualifiedCareEventsTable} as ce
            where ce.patient_id = $1

            union all

            select
              ('medication:' || m.id::text) as timeline_id,
              m.patient_id,
              m.id as event_id,
              'medication'::text as event_type,
              coalesce(m.next_gp_contact_date::timestamp, m.updated_at, m.created_at) as event_date,
              m.name as summary
            from ${qualifiedMedicationsTable} as m
            where m.patient_id = $1
              and m.deleted_at is null

            union all

            select
              ('document:' || d.id::text) as timeline_id,
              d.patient_id,
              d.id as event_id,
              'document'::text as event_type,
              d.uploaded_at as event_date,
              d.original_filename as summary
            from ${qualifiedDocumentsTable} as d
            where d.patient_id = $1
          )
          select
            te.timeline_id,
            te.patient_id,
            te.event_id,
            te.event_type,
            te.event_date,
            te.summary
          from timeline_events as te
          where ($2::text is null or te.event_type = $2)
            and ($3::date is null or te.event_date >= $3::date)
            and ($4::date is null or te.event_date < ($4::date + interval '1 day'))
          order by te.event_date desc, te.timeline_id desc
        `,
        [
          patientId,
          filters.eventType ?? null,
          filters.startDate ?? null,
          filters.endDate ?? null,
        ],
      );
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
