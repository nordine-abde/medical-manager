import type { Sql } from "postgres";

import {
  databaseSchemaName,
  qualifyTableName,
  quoteIdentifier,
} from "../../db/schema";

export const prescriptionTypes = [
  "exam",
  "visit",
  "therapy",
  "medication",
] as const;

export type PrescriptionType = (typeof prescriptionTypes)[number];
export const legacyPrescriptionTypeAlias = "specialist_visit" as const;
export type LegacyPrescriptionTypeAlias = typeof legacyPrescriptionTypeAlias;
export type PrescriptionRecord = {
  created_at: Date;
  deleted_at: Date | null;
  expiration_date: Date | string | null;
  id: string;
  issue_date: Date | string | null;
  notes: string | null;
  patient_id: string;
  prescription_type: PrescriptionType;
  subtype: string | null;
  updated_at: Date;
};

export type CreatePrescriptionInput = {
  expirationDate: string | null;
  issueDate: string | null;
  notes: string | null;
  prescriptionType: PrescriptionType;
  subtype: string | null;
};

export type UpdatePrescriptionInput = Partial<CreatePrescriptionInput>;
export type PrescriptionListFilters = {
  includeArchived: boolean;
  prescriptionType?: PrescriptionType;
};

const patientsTable = (schemaName: string): string =>
  qualifyTableName(schemaName, "patients");

const patientUsersTable = (schemaName: string): string =>
  qualifyTableName(schemaName, "patient_users");

const prescriptionsTable = (schemaName: string): string =>
  qualifyTableName(schemaName, "prescriptions");

const qualifyTypeName = (schemaName: string, typeName: string): string =>
  `${quoteIdentifier(schemaName)}.${quoteIdentifier(typeName)}`;

export const createPrescriptionsRepository = (
  sql: Sql,
  schemaName = databaseSchemaName,
) => {
  const qualifiedPatientsTable = patientsTable(schemaName);
  const qualifiedPatientUsersTable = patientUsersTable(schemaName);
  const qualifiedPrescriptionsTable = prescriptionsTable(schemaName);
  const qualifiedPrescriptionTypeType = qualifyTypeName(
    schemaName,
    "prescription_type",
  );

  return {
    async create(
      userId: string,
      patientId: string,
      input: CreatePrescriptionInput,
    ): Promise<PrescriptionRecord | null> {
      const hasAccess = await this.hasPatientAccess(userId, patientId);

      if (!hasAccess) {
        return null;
      }

      const [createdPrescription] = await sql.unsafe<Array<{ id: string }>>(
        `
          insert into ${qualifiedPrescriptionsTable} (
            patient_id,
            prescription_type,
            subtype,
            issue_date,
            expiration_date,
            notes
          )
          values ($1, $2, $3, $4, $5, $6)
          returning id
        `,
        [
          patientId,
          input.prescriptionType,
          input.subtype,
          input.issueDate,
          input.expirationDate,
          input.notes,
        ],
      );

      if (!createdPrescription) {
        return null;
      }

      return this.findAccessibleById(userId, createdPrescription.id);
    },

    async findAccessibleById(
      userId: string,
      prescriptionId: string,
    ): Promise<PrescriptionRecord | null> {
      const [prescription] = await sql.unsafe<[PrescriptionRecord]>(
        `
          select
            p.id,
            p.patient_id,
            p.prescription_type,
            p.subtype,
            p.issue_date,
            p.expiration_date,
            p.notes,
            p.deleted_at,
            p.created_at,
            p.updated_at
          from ${qualifiedPrescriptionsTable} as p
          inner join ${qualifiedPatientUsersTable} as pu
            on pu.patient_id = p.patient_id
          where pu.user_id = $1
            and p.id = $2
          limit 1
        `,
        [userId, prescriptionId],
      );

      return prescription ?? null;
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

    async listByPatient(
      userId: string,
      patientId: string,
      filters: PrescriptionListFilters,
    ): Promise<PrescriptionRecord[] | null> {
      const hasAccess = await this.hasPatientAccess(userId, patientId);

      if (!hasAccess) {
        return null;
      }

      return sql.unsafe<PrescriptionRecord[]>(
        `
          select
            p.id,
            p.patient_id,
            p.prescription_type,
            p.subtype,
            p.issue_date,
            p.expiration_date,
            p.notes,
            p.deleted_at,
            p.created_at,
            p.updated_at
          from ${qualifiedPrescriptionsTable} as p
          where p.patient_id = $1
            and ($2 or p.deleted_at is null)
            and ($3::${qualifiedPrescriptionTypeType} is null or p.prescription_type = $3::${qualifiedPrescriptionTypeType})
          order by
            p.deleted_at asc nulls first,
            p.issue_date desc nulls last,
            p.created_at desc
        `,
        [patientId, filters.includeArchived, filters.prescriptionType ?? null],
      );
    },

    async updateAccessible(
      userId: string,
      prescriptionId: string,
      input: UpdatePrescriptionInput,
    ): Promise<PrescriptionRecord | null> {
      const existingPrescription = await this.findAccessibleById(
        userId,
        prescriptionId,
      );

      if (!existingPrescription) {
        return null;
      }

      const [updatedPrescription] = await sql.unsafe<Array<{ id: string }>>(
        `
          update ${qualifiedPrescriptionsTable}
          set
            prescription_type = $2,
            subtype = $3,
            issue_date = $4,
            expiration_date = $5,
            notes = $6,
            updated_at = now()
          where id = $7
          returning id
        `,
        [
          input.prescriptionType ?? existingPrescription.prescription_type,
          input.subtype === undefined
            ? existingPrescription.subtype
            : input.subtype,
          input.issueDate === undefined
            ? existingPrescription.issue_date
            : input.issueDate,
          input.expirationDate === undefined
            ? existingPrescription.expiration_date
            : input.expirationDate,
          input.notes === undefined ? existingPrescription.notes : input.notes,
          prescriptionId,
        ],
      );

      if (!updatedPrescription) {
        return null;
      }

      return this.findAccessibleById(userId, updatedPrescription.id);
    },
  };
};

export type PrescriptionsRepository = ReturnType<
  typeof createPrescriptionsRepository
>;
