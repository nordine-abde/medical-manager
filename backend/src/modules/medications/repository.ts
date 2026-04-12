import type { Sql } from "postgres";

import { databaseSchemaName, qualifyTableName } from "../../db/schema";

export type MedicationRecord = {
  condition_id: string | null;
  created_at: Date;
  deleted_at: Date | null;
  dosage: string;
  id: string;
  name: string;
  next_gp_contact_date: Date | string | null;
  notes: string | null;
  patient_id: string;
  prescribing_doctor: string | null;
  quantity: string;
  renewal_cadence: string | null;
  updated_at: Date;
};

export type MedicationPrescriptionContext = {
  collected_at: Date | null;
  created_at: Date;
  deleted_at: Date | null;
  expiration_date: Date | string | null;
  id: string;
  issue_date: Date | string | null;
  medication_id: string | null;
  patient_id: string;
  prescription_type: string;
  received_at: Date | null;
  requested_at: Date | null;
  status: string;
};

export type MedicationTaskContext = {
  auto_recurrence_enabled: boolean;
  due_date: Date | string | null;
  id: string;
  medication_id: string | null;
  recurrence_rule: string | null;
  scheduled_at: Date | null;
  status: string;
  title: string;
};

export type CreateMedicationInput = {
  conditionId: string | null;
  dosage: string;
  name: string;
  nextGpContactDate: string | null;
  notes: string | null;
  prescribingDoctor: string | null;
  quantity: string;
  renewalCadence: string | null;
};

export type UpdateMedicationInput = Partial<CreateMedicationInput>;

export type MedicationListFilters = {
  includeArchived: boolean;
};

const patientsTable = (schemaName: string): string =>
  qualifyTableName(schemaName, "patients");

const patientUsersTable = (schemaName: string): string =>
  qualifyTableName(schemaName, "patient_users");

const conditionsTable = (schemaName: string): string =>
  qualifyTableName(schemaName, "conditions");

const medicationsTable = (schemaName: string): string =>
  qualifyTableName(schemaName, "medications");

const prescriptionsTable = (schemaName: string): string =>
  qualifyTableName(schemaName, "prescriptions");

const tasksTable = (schemaName: string): string =>
  qualifyTableName(schemaName, "tasks");

export const createMedicationsRepository = (
  sql: Sql,
  schemaName = databaseSchemaName,
) => {
  const qualifiedPatientsTable = patientsTable(schemaName);
  const qualifiedPatientUsersTable = patientUsersTable(schemaName);
  const qualifiedConditionsTable = conditionsTable(schemaName);
  const qualifiedMedicationsTable = medicationsTable(schemaName);
  const qualifiedPrescriptionsTable = prescriptionsTable(schemaName);
  const qualifiedTasksTable = tasksTable(schemaName);
  const medicationColumns = `
    m.id,
    m.patient_id,
    m.condition_id,
    m.name,
    m.dosage,
    m.quantity,
    m.prescribing_doctor,
    m.renewal_cadence,
    m.next_gp_contact_date,
    m.notes,
    m.deleted_at,
    m.created_at,
    m.updated_at
  `;

  return {
    async create(
      userId: string,
      patientId: string,
      input: CreateMedicationInput,
    ): Promise<MedicationRecord | null> {
      const hasAccess = await this.hasPatientAccess(userId, patientId);

      if (!hasAccess) {
        return null;
      }

      const linksAreValid = await this.hasValidOptionalLinks(
        patientId,
        input.conditionId,
      );

      if (!linksAreValid) {
        return null;
      }

      const [createdMedication] = await sql.unsafe<Array<{ id: string }>>(
        `
          insert into ${qualifiedMedicationsTable} (
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
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          returning id
        `,
        [
          patientId,
          input.conditionId,
          input.name,
          input.dosage,
          input.quantity,
          input.prescribingDoctor,
          input.renewalCadence,
          input.nextGpContactDate,
          input.notes,
        ],
      );

      if (!createdMedication) {
        return null;
      }

      return this.findAccessibleById(userId, createdMedication.id);
    },

    async findAccessibleById(
      userId: string,
      medicationId: string,
    ): Promise<MedicationRecord | null> {
      const [medication] = await sql.unsafe<[MedicationRecord]>(
        `
          select
            ${medicationColumns}
          from ${qualifiedMedicationsTable} as m
          inner join ${qualifiedPatientUsersTable} as pu
            on pu.patient_id = m.patient_id
          where pu.user_id = $1
            and m.id = $2
          limit 1
        `,
        [userId, medicationId],
      );

      return medication ?? null;
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

    async hasValidOptionalLinks(
      patientId: string,
      conditionId: string | null,
    ): Promise<boolean> {
      if (!conditionId) {
        return true;
      }

      const [condition] = await sql.unsafe<Array<{ id: string }>>(
        `
          select c.id
          from ${qualifiedConditionsTable} as c
          where c.id = $1
            and c.patient_id = $2
          limit 1
        `,
        [conditionId, patientId],
      );

      return condition !== undefined;
    },

    async listByPatient(
      userId: string,
      patientId: string,
      filters: MedicationListFilters,
    ): Promise<MedicationRecord[] | null> {
      const hasAccess = await this.hasPatientAccess(userId, patientId);

      if (!hasAccess) {
        return null;
      }

      return sql.unsafe<MedicationRecord[]>(
        `
          select
            ${medicationColumns}
          from ${qualifiedMedicationsTable} as m
          where m.patient_id = $1
            and ($2 or m.deleted_at is null)
          order by
            m.deleted_at asc nulls first,
            m.next_gp_contact_date asc nulls last,
            lower(m.name) asc,
            m.created_at asc
        `,
        [patientId, filters.includeArchived],
      );
    },

    async listPrescriptionContextsAccessible(
      userId: string,
      medicationIds: readonly string[],
    ): Promise<MedicationPrescriptionContext[]> {
      if (medicationIds.length === 0) {
        return [];
      }

      return sql.unsafe<MedicationPrescriptionContext[]>(
        `
          select
            p.id,
            p.patient_id,
            p.medication_id,
            p.prescription_type,
            p.status,
            p.requested_at,
            p.received_at,
            p.collected_at,
            p.issue_date,
            p.expiration_date,
            p.deleted_at,
            p.created_at
          from ${qualifiedPrescriptionsTable} as p
          inner join ${qualifiedPatientUsersTable} as pu
            on pu.patient_id = p.patient_id
          where pu.user_id = $1
            and p.medication_id = any($2::uuid[])
          order by
            p.deleted_at asc nulls first,
            p.issue_date desc nulls last,
            p.created_at desc
        `,
        [userId, medicationIds],
      );
    },

    async listTaskContextsAccessible(
      userId: string,
      medicationIds: readonly string[],
    ): Promise<MedicationTaskContext[]> {
      if (medicationIds.length === 0) {
        return [];
      }

      return sql.unsafe<MedicationTaskContext[]>(
        `
          select
            t.id,
            t.medication_id,
            t.title,
            t.status,
            t.due_date,
            t.scheduled_at,
            t.auto_recurrence_enabled,
            t.recurrence_rule
          from ${qualifiedTasksTable} as t
          inner join ${qualifiedPatientUsersTable} as pu
            on pu.patient_id = t.patient_id
          where pu.user_id = $1
            and t.medication_id = any($2::uuid[])
            and t.deleted_at is null
            and t.task_type = 'medication_renewal'
          order by
            t.completed_at asc nulls first,
            t.due_date asc nulls last,
            t.scheduled_at asc nulls last,
            lower(t.title) asc,
            t.created_at asc
        `,
        [userId, medicationIds],
      );
    },

    async setArchivedState(
      userId: string,
      medicationId: string,
      archived: boolean,
    ): Promise<MedicationRecord | null> {
      const existingMedication = await this.findAccessibleById(
        userId,
        medicationId,
      );

      if (!existingMedication) {
        return null;
      }

      const [updatedMedication] = await sql.unsafe<Array<{ id: string }>>(
        `
          update ${qualifiedMedicationsTable}
          set
            deleted_at = ${archived ? "now()" : "null"},
            updated_at = now()
          where id = $1
          returning id
        `,
        [medicationId],
      );

      if (!updatedMedication) {
        return null;
      }

      return this.findAccessibleById(userId, updatedMedication.id);
    },

    async updateAccessible(
      userId: string,
      medicationId: string,
      input: UpdateMedicationInput,
    ): Promise<MedicationRecord | null> {
      const existingMedication = await this.findAccessibleById(
        userId,
        medicationId,
      );

      if (!existingMedication) {
        return null;
      }

      const conditionId =
        input.conditionId === undefined
          ? existingMedication.condition_id
          : input.conditionId;

      const linksAreValid = await this.hasValidOptionalLinks(
        existingMedication.patient_id,
        conditionId,
      );

      if (!linksAreValid) {
        return null;
      }

      const [updatedMedication] = await sql.unsafe<Array<{ id: string }>>(
        `
          update ${qualifiedMedicationsTable}
          set
            condition_id = $1,
            name = $2,
            dosage = $3,
            quantity = $4,
            prescribing_doctor = $5,
            renewal_cadence = $6,
            next_gp_contact_date = $7,
            notes = $8,
            updated_at = now()
          where id = $9
          returning id
        `,
        [
          conditionId,
          input.name ?? existingMedication.name,
          input.dosage ?? existingMedication.dosage,
          input.quantity ?? existingMedication.quantity,
          input.prescribingDoctor === undefined
            ? existingMedication.prescribing_doctor
            : input.prescribingDoctor,
          input.renewalCadence === undefined
            ? existingMedication.renewal_cadence
            : input.renewalCadence,
          input.nextGpContactDate === undefined
            ? existingMedication.next_gp_contact_date
            : input.nextGpContactDate,
          input.notes === undefined ? existingMedication.notes : input.notes,
          medicationId,
        ],
      );

      if (!updatedMedication) {
        return null;
      }

      return this.findAccessibleById(userId, updatedMedication.id);
    },
  };
};

export type MedicationsRepository = ReturnType<
  typeof createMedicationsRepository
>;
