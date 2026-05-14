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

export const prescriptionStatuses = [
  "needed",
  "requested",
  "available",
  "collected",
  "used",
  "expired",
  "cancelled",
] as const;

export type PrescriptionStatus = (typeof prescriptionStatuses)[number];

export type PrescriptionRecord = {
  collected_at: Date | null;
  created_at: Date;
  deleted_at: Date | null;
  expiration_date: Date | string | null;
  id: string;
  issue_date: Date | string | null;
  notes: string | null;
  patient_id: string;
  prescription_type: PrescriptionType;
  subtype: string | null;
  received_at: Date | null;
  requested_at: Date | null;
  status: PrescriptionStatus;
  updated_at: Date;
};

export type CreatePrescriptionInput = {
  collectedAt: string | null;
  expirationDate: string | null;
  issueDate: string | null;
  notes: string | null;
  prescriptionType: PrescriptionType;
  subtype: string | null;
  receivedAt: string | null;
  requestedAt: string | null;
  status: PrescriptionStatus;
};

export type UpdatePrescriptionInput = Partial<
  Omit<CreatePrescriptionInput, "status">
>;

export type UpdatePrescriptionStatusInput = {
  collectedAt: string | null;
  receivedAt: string | null;
  requestedAt: string | null;
  status: PrescriptionStatus;
};

export type PrescriptionListFilters = {
  includeArchived: boolean;
  prescriptionType?: PrescriptionType;
  status?: PrescriptionStatus;
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
  const qualifiedPrescriptionStatusType = qualifyTypeName(
    schemaName,
    "prescription_status",
  );
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
            requested_at,
            received_at,
            collected_at,
            issue_date,
            expiration_date,
            status,
            notes
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          returning id
        `,
        [
          patientId,
          input.prescriptionType,
          input.subtype,
          input.requestedAt,
          input.receivedAt,
          input.collectedAt,
          input.issueDate,
          input.expirationDate,
          input.status,
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
            p.requested_at,
            p.received_at,
            p.collected_at,
            p.issue_date,
            p.expiration_date,
            p.status,
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
            p.requested_at,
            p.received_at,
            p.collected_at,
            p.issue_date,
            p.expiration_date,
            p.status,
            p.notes,
            p.deleted_at,
            p.created_at,
            p.updated_at
          from ${qualifiedPrescriptionsTable} as p
          where p.patient_id = $1
            and ($2 or p.deleted_at is null)
            and ($3::${qualifiedPrescriptionStatusType} is null or p.status = $3::${qualifiedPrescriptionStatusType})
            and ($4::${qualifiedPrescriptionTypeType} is null or p.prescription_type = $4::${qualifiedPrescriptionTypeType})
          order by
            p.deleted_at asc nulls first,
            p.status asc,
            p.issue_date desc nulls last,
            p.created_at desc
        `,
        [
          patientId,
          filters.includeArchived,
          filters.status ?? null,
          filters.prescriptionType ?? null,
        ],
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
            requested_at = $4,
            received_at = $5,
            collected_at = $6,
            issue_date = $7,
            expiration_date = $8,
            notes = $9,
            updated_at = now()
          where id = $10
          returning id
        `,
        [
          input.prescriptionType ?? existingPrescription.prescription_type,
          input.subtype === undefined
            ? existingPrescription.subtype
            : input.subtype,
          input.requestedAt === undefined
            ? existingPrescription.requested_at
            : input.requestedAt,
          input.receivedAt === undefined
            ? existingPrescription.received_at
            : input.receivedAt,
          input.collectedAt === undefined
            ? existingPrescription.collected_at
            : input.collectedAt,
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

    async updateStatusAccessible(
      userId: string,
      prescriptionId: string,
      input: UpdatePrescriptionStatusInput,
    ): Promise<PrescriptionRecord | null> {
      const existingPrescription = await this.findAccessibleById(
        userId,
        prescriptionId,
      );

      if (!existingPrescription || existingPrescription.deleted_at) {
        return null;
      }

      const [updatedPrescription] = await sql.unsafe<Array<{ id: string }>>(
        `
          update ${qualifiedPrescriptionsTable}
          set
            status = $1,
            requested_at = $2,
            received_at = $3,
            collected_at = $4,
            updated_at = now()
          where id = $5
          returning id
        `,
        [
          input.status,
          input.requestedAt,
          input.receivedAt,
          input.collectedAt,
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
