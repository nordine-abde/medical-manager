import type { Sql } from "postgres";

import {
  databaseSchemaName,
  qualifyTableName,
  quoteIdentifier,
} from "../../db/schema";

export const careEventTypes = [
  "exam",
  "specialist_visit",
  "treatment",
] as const;

export type CareEventType = (typeof careEventTypes)[number];

export type CareEventRecord = {
  booking_id: string | null;
  completed_at: Date;
  created_at: Date;
  event_type: CareEventType;
  facility_id: string | null;
  id: string;
  outcome_notes: string | null;
  patient_id: string;
  provider_name: string | null;
  subtype: string | null;
  task_id: string | null;
  updated_at: Date;
};

export type CreateCareEventInput = {
  bookingId: string | null;
  completedAt: string;
  eventType: CareEventType;
  facilityId: string | null;
  outcomeNotes: string | null;
  providerName: string | null;
  subtype: string | null;
  taskId: string | null;
};

export type UpdateCareEventInput = Partial<CreateCareEventInput>;

const patientsTable = (schemaName: string): string =>
  qualifyTableName(schemaName, "patients");

const patientUsersTable = (schemaName: string): string =>
  qualifyTableName(schemaName, "patient_users");

const tasksTable = (schemaName: string): string =>
  qualifyTableName(schemaName, "tasks");

const bookingsTable = (schemaName: string): string =>
  qualifyTableName(schemaName, "bookings");

const facilitiesTable = (schemaName: string): string =>
  qualifyTableName(schemaName, "facilities");

const careEventsTable = (schemaName: string): string =>
  qualifyTableName(schemaName, "care_events");

const qualifyTypeName = (schemaName: string, typeName: string): string =>
  `${quoteIdentifier(schemaName)}.${quoteIdentifier(typeName)}`;

export const createCareEventsRepository = (
  sql: Sql,
  schemaName = databaseSchemaName,
) => {
  const qualifiedPatientsTable = patientsTable(schemaName);
  const qualifiedPatientUsersTable = patientUsersTable(schemaName);
  const qualifiedTasksTable = tasksTable(schemaName);
  const qualifiedBookingsTable = bookingsTable(schemaName);
  const qualifiedFacilitiesTable = facilitiesTable(schemaName);
  const qualifiedCareEventsTable = careEventsTable(schemaName);
  const qualifiedCareEventType = qualifyTypeName(schemaName, "care_event_type");
  const careEventColumns = `
    ce.id,
    ce.patient_id,
    ce.task_id,
    ce.booking_id,
    ce.facility_id,
    ce.provider_name,
    ce.event_type,
    ce.subtype,
    ce.completed_at,
    ce.outcome_notes,
    ce.created_at,
    ce.updated_at
  `;

  return {
    async create(
      userId: string,
      patientId: string,
      input: CreateCareEventInput,
    ): Promise<CareEventRecord | null> {
      const hasAccess = await this.hasPatientAccess(userId, patientId);

      if (!hasAccess) {
        return null;
      }

      const linksAreValid = await this.hasValidLinks(
        patientId,
        input.taskId,
        input.bookingId,
        input.facilityId,
      );

      if (!linksAreValid) {
        return null;
      }

      const [createdCareEvent] = await sql.unsafe<Array<{ id: string }>>(
        `
          insert into ${qualifiedCareEventsTable} (
            patient_id,
            task_id,
            booking_id,
            facility_id,
            provider_name,
            event_type,
            subtype,
            completed_at,
            outcome_notes
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          returning id
        `,
        [
          patientId,
          input.taskId,
          input.bookingId,
          input.facilityId,
          input.providerName,
          input.eventType,
          input.subtype,
          input.completedAt,
          input.outcomeNotes,
        ],
      );

      if (!createdCareEvent) {
        return null;
      }

      return this.findAccessibleById(userId, createdCareEvent.id);
    },

    async findAccessibleById(
      userId: string,
      careEventId: string,
    ): Promise<CareEventRecord | null> {
      const [careEvent] = await sql.unsafe<[CareEventRecord]>(
        `
          select
            ${careEventColumns}
          from ${qualifiedCareEventsTable} as ce
          inner join ${qualifiedPatientUsersTable} as pu
            on pu.patient_id = ce.patient_id
          where pu.user_id = $1
            and ce.id = $2
          limit 1
        `,
        [userId, careEventId],
      );

      return careEvent ?? null;
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
      taskId: string | null,
      bookingId: string | null,
      facilityId: string | null,
    ): Promise<boolean> {
      if (taskId) {
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
      }

      if (bookingId) {
        const [booking] = await sql.unsafe<Array<{ id: string }>>(
          `
            select b.id
            from ${qualifiedBookingsTable} as b
            where b.id = $1
              and b.patient_id = $2
            limit 1
          `,
          [bookingId, patientId],
        );

        if (!booking) {
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
    ): Promise<CareEventRecord[] | null> {
      const hasAccess = await this.hasPatientAccess(userId, patientId);

      if (!hasAccess) {
        return null;
      }

      return sql.unsafe<CareEventRecord[]>(
        `
          select
            ${careEventColumns}
          from ${qualifiedCareEventsTable} as ce
          where ce.patient_id = $1
          order by
            ce.completed_at desc,
            ce.created_at desc
        `,
        [patientId],
      );
    },

    async updateAccessible(
      userId: string,
      careEventId: string,
      input: UpdateCareEventInput,
    ): Promise<CareEventRecord | null> {
      const existingCareEvent = await this.findAccessibleById(
        userId,
        careEventId,
      );

      if (!existingCareEvent) {
        return null;
      }

      const taskId =
        input.taskId === undefined ? existingCareEvent.task_id : input.taskId;
      const bookingId =
        input.bookingId === undefined
          ? existingCareEvent.booking_id
          : input.bookingId;
      const facilityId =
        input.facilityId === undefined
          ? existingCareEvent.facility_id
          : input.facilityId;
      const providerName =
        input.providerName === undefined
          ? existingCareEvent.provider_name
          : input.providerName;
      const eventType =
        input.eventType === undefined
          ? existingCareEvent.event_type
          : input.eventType;
      const subtype =
        input.subtype === undefined ? existingCareEvent.subtype : input.subtype;
      const completedAt =
        input.completedAt === undefined
          ? existingCareEvent.completed_at.toISOString()
          : input.completedAt;
      const outcomeNotes =
        input.outcomeNotes === undefined
          ? existingCareEvent.outcome_notes
          : input.outcomeNotes;

      const linksAreValid = await this.hasValidLinks(
        existingCareEvent.patient_id,
        taskId,
        bookingId,
        facilityId,
      );

      if (!linksAreValid) {
        return null;
      }

      const [updatedCareEvent] = await sql.unsafe<Array<{ id: string }>>(
        `
          update ${qualifiedCareEventsTable}
          set
            task_id = $2,
            booking_id = $3,
            facility_id = $4,
            provider_name = $5,
            event_type = $6::${qualifiedCareEventType},
            subtype = $7,
            completed_at = $8,
            outcome_notes = $9,
            updated_at = now()
          where id = $1
          returning id
        `,
        [
          careEventId,
          taskId,
          bookingId,
          facilityId,
          providerName,
          eventType,
          subtype,
          completedAt,
          outcomeNotes,
        ],
      );

      if (!updatedCareEvent) {
        return null;
      }

      return this.findAccessibleById(userId, updatedCareEvent.id);
    },
  };
};

export type CareEventsRepository = ReturnType<
  typeof createCareEventsRepository
>;
