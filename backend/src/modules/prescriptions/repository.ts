import type { Sql } from "postgres";

import {
  databaseSchemaName,
  qualifyTableName,
  quoteIdentifier,
} from "../../db/schema";
import type {
  CreateDocumentInput,
  DocumentRecord,
} from "../documents/repository";

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
export type CreatePrescriptionDocumentInput = Omit<
  CreateDocumentInput,
  "patientId" | "relatedEntityId" | "relatedEntityType"
>;
export type PrescriptionWithDocumentRecord = {
  document: DocumentRecord;
  prescription: PrescriptionRecord;
};
export type PrescriptionListFilters = {
  from?: string;
  hideBooked: boolean;
  includeArchived: boolean;
  page: number;
  pageSize: number;
  prescriptionType?: PrescriptionType;
  search?: string;
  subtype?: string;
  to?: string;
};
export type PrescriptionListResult = {
  items: PrescriptionRecord[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};
export type PrescriptionSubtypeOption = {
  prescription_type: PrescriptionType;
  subtype: string;
};

const patientsTable = (schemaName: string): string =>
  qualifyTableName(schemaName, "patients");

const patientUsersTable = (schemaName: string): string =>
  qualifyTableName(schemaName, "patient_users");

const prescriptionsTable = (schemaName: string): string =>
  qualifyTableName(schemaName, "prescriptions");

const bookingsTable = (schemaName: string): string =>
  qualifyTableName(schemaName, "bookings");

const documentsTable = (schemaName: string): string =>
  qualifyTableName(schemaName, "documents");

const qualifyTypeName = (schemaName: string, typeName: string): string =>
  `${quoteIdentifier(schemaName)}.${quoteIdentifier(typeName)}`;

export const createPrescriptionsRepository = (
  sql: Sql,
  schemaName = databaseSchemaName,
) => {
  const qualifiedPatientsTable = patientsTable(schemaName);
  const qualifiedPatientUsersTable = patientUsersTable(schemaName);
  const qualifiedPrescriptionsTable = prescriptionsTable(schemaName);
  const qualifiedBookingsTable = bookingsTable(schemaName);
  const qualifiedDocumentsTable = documentsTable(schemaName);
  const qualifiedPrescriptionTypeType = qualifyTypeName(
    schemaName,
    "prescription_type",
  );
  const qualifiedRelatedEntityType = qualifyTypeName(
    schemaName,
    "related_entity_type",
  );
  const qualifiedDocumentType = qualifyTypeName(schemaName, "document_type");
  const documentReturningColumns = `
    id,
    patient_id,
    related_entity_type,
    related_entity_id,
    stored_filename,
    original_filename,
    mime_type,
    file_size_bytes,
    document_type,
    uploaded_by_user_id,
    uploaded_at,
    notes
  `;
  const insertDocument = async (
    executor: Pick<Sql, "unsafe">,
    patientId: string,
    relatedEntityId: string,
    input: CreatePrescriptionDocumentInput,
  ): Promise<DocumentRecord> => {
    const [document] = await executor.unsafe<[DocumentRecord]>(
      `
        insert into ${qualifiedDocumentsTable} (
          patient_id,
          related_entity_type,
          related_entity_id,
          stored_filename,
          original_filename,
          mime_type,
          file_size_bytes,
          document_type,
          uploaded_by_user_id,
          notes
        )
        values (
          $1,
          $2::${qualifiedRelatedEntityType},
          $3,
          $4,
          $5,
          $6,
          $7,
          $8::${qualifiedDocumentType},
          $9,
          $10
        )
        returning
          ${documentReturningColumns}
      `,
      [
        patientId,
        "prescription",
        relatedEntityId,
        input.storedFilename,
        input.originalFilename,
        input.mimeType,
        input.fileSizeBytes,
        input.documentType,
        input.uploadedByUserId,
        input.notes,
      ],
    );

    return document;
  };

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

    async createWithDocument(
      userId: string,
      patientId: string,
      input: CreatePrescriptionInput & {
        document: CreatePrescriptionDocumentInput;
      },
    ): Promise<PrescriptionWithDocumentRecord | null> {
      const hasAccess = await this.hasPatientAccess(userId, patientId);

      if (!hasAccess) {
        return null;
      }

      const result = await sql.begin(async (transaction) => {
        const [createdPrescription] = await transaction.unsafe<
          Array<{ id: string }>
        >(
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

        const document = await insertDocument(
          transaction,
          patientId,
          createdPrescription.id,
          input.document,
        );

        return {
          document,
          prescriptionId: createdPrescription.id,
        };
      });

      if (!result) {
        return null;
      }

      const prescription = await this.findAccessibleById(
        userId,
        result.prescriptionId,
      );

      if (!prescription) {
        return null;
      }

      return {
        document: result.document,
        prescription,
      };
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

    async deleteAccessible(
      userId: string,
      prescriptionId: string,
    ): Promise<PrescriptionRecord | null> {
      const existingPrescription = await this.findAccessibleById(
        userId,
        prescriptionId,
      );

      if (!existingPrescription) {
        return null;
      }

      const [deletedPrescription] = await sql.unsafe<Array<{ id: string }>>(
        `
          update ${qualifiedPrescriptionsTable}
          set
            deleted_at = coalesce(deleted_at, now()),
            updated_at = now()
          where id = $1
          returning id
        `,
        [prescriptionId],
      );

      if (!deletedPrescription) {
        return null;
      }

      return this.findAccessibleById(userId, deletedPrescription.id);
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
    ): Promise<PrescriptionListResult | null> {
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
        filters.prescriptionType ?? null,
        search,
        subtype,
        filters.from ?? null,
        filters.to ?? null,
        filters.hideBooked,
      ];
      const whereClause = `
        p.patient_id = $1
        and ($2 or p.deleted_at is null)
        and ($3::${qualifiedPrescriptionTypeType} is null or p.prescription_type = $3::${qualifiedPrescriptionTypeType})
        and (
          $4::text is null
          or lower(coalesce(p.subtype, '')) like '%' || $4 || '%'
          or lower(coalesce(p.notes, '')) like '%' || $4 || '%'
          or p.prescription_type::text like '%' || $4 || '%'
        )
        and ($5::text is null or lower(coalesce(p.subtype, '')) = $5)
        and ($6::date is null or p.issue_date >= $6::date)
        and ($7::date is null or p.issue_date <= $7::date)
        and (
          not $8::boolean
          or not exists (
            select 1
            from ${qualifiedBookingsTable} as b
            where b.patient_id = p.patient_id
              and b.prescription_id = p.id
              and b.deleted_at is null
          )
        )
      `;

      const [countResult] = await sql.unsafe<Array<{ total: string }>>(
        `
          select count(*)::text as total
          from ${qualifiedPrescriptionsTable} as p
          where ${whereClause}
        `,
        filterParams,
      );

      const items = await sql.unsafe<PrescriptionRecord[]>(
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
          where ${whereClause}
          order by
            p.deleted_at asc nulls first,
            p.issue_date desc nulls last,
            p.created_at desc,
            p.id desc
          limit $9
          offset $10
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

    async listSubtypesByPatient(
      userId: string,
      patientId: string,
    ): Promise<PrescriptionSubtypeOption[] | null> {
      const hasAccess = await this.hasPatientAccess(userId, patientId);

      if (!hasAccess) {
        return null;
      }

      return sql.unsafe<PrescriptionSubtypeOption[]>(
        `
          select
            p.prescription_type,
            btrim(p.subtype) as subtype
          from ${qualifiedPrescriptionsTable} as p
          where p.patient_id = $1
            and p.deleted_at is null
            and p.subtype is not null
            and btrim(p.subtype) <> ''
          group by p.prescription_type, btrim(p.subtype)
          order by p.prescription_type, btrim(p.subtype)
        `,
        [patientId],
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
            prescription_type = $1,
            subtype = $2,
            issue_date = $3,
            expiration_date = $4,
            notes = $5,
            updated_at = now()
          where id = $6
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

    async updateWithDocument(
      userId: string,
      prescriptionId: string,
      input: UpdatePrescriptionInput & {
        document: CreatePrescriptionDocumentInput;
      },
    ): Promise<PrescriptionWithDocumentRecord | null> {
      const existingPrescription = await this.findAccessibleById(
        userId,
        prescriptionId,
      );

      if (!existingPrescription) {
        return null;
      }

      const result = await sql.begin(async (transaction) => {
        const [updatedPrescription] = await transaction.unsafe<
          Array<{ id: string }>
        >(
          `
            update ${qualifiedPrescriptionsTable}
            set
              prescription_type = $1,
              subtype = $2,
              issue_date = $3,
              expiration_date = $4,
              notes = $5,
              updated_at = now()
            where id = $6
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
            input.notes === undefined
              ? existingPrescription.notes
              : input.notes,
            prescriptionId,
          ],
        );

        if (!updatedPrescription) {
          return null;
        }

        const document = await insertDocument(
          transaction,
          existingPrescription.patient_id,
          prescriptionId,
          input.document,
        );

        return {
          document,
          prescriptionId: updatedPrescription.id,
        };
      });

      if (!result) {
        return null;
      }

      const prescription = await this.findAccessibleById(
        userId,
        result.prescriptionId,
      );

      if (!prescription) {
        return null;
      }

      return {
        document: result.document,
        prescription,
      };
    },
  };
};

export type PrescriptionsRepository = ReturnType<
  typeof createPrescriptionsRepository
>;
