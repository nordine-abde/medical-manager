import type { Sql } from "postgres";

import {
  databaseSchemaName,
  qualifyTableName,
  quoteIdentifier,
} from "../../db/schema";

export const documentTypes = [
  "prescription",
  "exam_result",
  "visit_report",
  "discharge_letter",
  "general_attachment",
] as const;

export type DocumentType = (typeof documentTypes)[number];

export const relatedEntityTypes = [
  "patient",
  "medical_instruction",
  "prescription",
  "booking",
  "care_event",
  "medication",
] as const;

export type RelatedEntityType = (typeof relatedEntityTypes)[number];

export type DocumentRecord = {
  document_type: DocumentType;
  file_size_bytes: number;
  id: string;
  mime_type: string;
  notes: string | null;
  original_filename: string;
  patient_id: string;
  related_entity_id: string;
  related_entity_type: RelatedEntityType;
  stored_filename: string;
  uploaded_at: Date;
  uploaded_by_user_id: string;
};

export type CreateDocumentInput = {
  documentType: DocumentType;
  fileSizeBytes: number;
  mimeType: string;
  notes: string | null;
  originalFilename: string;
  patientId: string;
  relatedEntityId: string;
  relatedEntityType: RelatedEntityType;
  storedFilename: string;
  uploadedByUserId: string;
};

const patientsTable = (schemaName: string): string =>
  qualifyTableName(schemaName, "patients");

const patientUsersTable = (schemaName: string): string =>
  qualifyTableName(schemaName, "patient_users");

const documentsTable = (schemaName: string): string =>
  qualifyTableName(schemaName, "documents");

const medicalInstructionsTable = (schemaName: string): string =>
  qualifyTableName(schemaName, "medical_instructions");

const prescriptionsTable = (schemaName: string): string =>
  qualifyTableName(schemaName, "prescriptions");

const bookingsTable = (schemaName: string): string =>
  qualifyTableName(schemaName, "bookings");

const careEventsTable = (schemaName: string): string =>
  qualifyTableName(schemaName, "care_events");

const medicationsTable = (schemaName: string): string =>
  qualifyTableName(schemaName, "medications");

const qualifyTypeName = (schemaName: string, typeName: string): string =>
  `${quoteIdentifier(schemaName)}.${quoteIdentifier(typeName)}`;

export const createDocumentsRepository = (
  sql: Sql,
  schemaName = databaseSchemaName,
) => {
  const qualifiedPatientsTable = patientsTable(schemaName);
  const qualifiedPatientUsersTable = patientUsersTable(schemaName);
  const qualifiedDocumentsTable = documentsTable(schemaName);
  const qualifiedMedicalInstructionsTable =
    medicalInstructionsTable(schemaName);
  const qualifiedPrescriptionsTable = prescriptionsTable(schemaName);
  const qualifiedBookingsTable = bookingsTable(schemaName);
  const qualifiedCareEventsTable = careEventsTable(schemaName);
  const qualifiedMedicationsTable = medicationsTable(schemaName);
  const qualifiedRelatedEntityType = qualifyTypeName(
    schemaName,
    "related_entity_type",
  );
  const qualifiedDocumentType = qualifyTypeName(schemaName, "document_type");

  const documentSelectColumns = `
    d.id,
    d.patient_id,
    d.related_entity_type,
    d.related_entity_id,
    d.stored_filename,
    d.original_filename,
    d.mime_type,
    d.file_size_bytes,
    d.document_type,
    d.uploaded_by_user_id,
    d.uploaded_at,
    d.notes
  `;
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

  return {
    async create(input: CreateDocumentInput): Promise<DocumentRecord> {
      const [document] = await sql.unsafe<[DocumentRecord]>(
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
          input.patientId,
          input.relatedEntityType,
          input.relatedEntityId,
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
    },

    async findAccessibleById(
      userId: string,
      documentId: string,
    ): Promise<DocumentRecord | null> {
      const [document] = await sql.unsafe<[DocumentRecord]>(
        `
          select
            ${documentSelectColumns}
          from ${qualifiedDocumentsTable} as d
          inner join ${qualifiedPatientUsersTable} as pu
            on pu.patient_id = d.patient_id
          where pu.user_id = $1
            and d.id = $2
          limit 1
        `,
        [userId, documentId],
      );

      return document ?? null;
    },

    async hasPatientAccess(
      userId: string,
      patientId: string,
    ): Promise<boolean> {
      const [patient] = await sql.unsafe<Array<{ id: string }>>(
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

      return patient !== undefined;
    },

    async hasValidRelatedEntity(
      patientId: string,
      relatedEntityType: RelatedEntityType,
      relatedEntityId: string,
    ): Promise<boolean> {
      if (relatedEntityType === "patient") {
        const [patient] = await sql.unsafe<Array<{ id: string }>>(
          `
            select p.id
            from ${qualifiedPatientsTable} as p
            where p.id = $1
              and p.id = $2
            limit 1
          `,
          [relatedEntityId, patientId],
        );

        return patient !== undefined;
      }

      if (relatedEntityType === "medical_instruction") {
        const [instruction] = await sql.unsafe<Array<{ id: string }>>(
          `
            select mi.id
            from ${qualifiedMedicalInstructionsTable} as mi
            where mi.id = $1
              and mi.patient_id = $2
            limit 1
          `,
          [relatedEntityId, patientId],
        );

        return instruction !== undefined;
      }

      if (relatedEntityType === "prescription") {
        const [prescription] = await sql.unsafe<Array<{ id: string }>>(
          `
            select p.id
            from ${qualifiedPrescriptionsTable} as p
            where p.id = $1
              and p.patient_id = $2
            limit 1
          `,
          [relatedEntityId, patientId],
        );

        return prescription !== undefined;
      }

      if (relatedEntityType === "booking") {
        const [booking] = await sql.unsafe<Array<{ id: string }>>(
          `
            select b.id
            from ${qualifiedBookingsTable} as b
            where b.id = $1
              and b.patient_id = $2
            limit 1
          `,
          [relatedEntityId, patientId],
        );

        return booking !== undefined;
      }

      if (relatedEntityType === "care_event") {
        const [careEvent] = await sql.unsafe<Array<{ id: string }>>(
          `
            select ce.id
            from ${qualifiedCareEventsTable} as ce
            where ce.id = $1
              and ce.patient_id = $2
            limit 1
          `,
          [relatedEntityId, patientId],
        );

        return careEvent !== undefined;
      }

      if (relatedEntityType === "medication") {
        const [medication] = await sql.unsafe<Array<{ id: string }>>(
          `
            select m.id
            from ${qualifiedMedicationsTable} as m
            where m.id = $1
              and m.patient_id = $2
            limit 1
          `,
          [relatedEntityId, patientId],
        );

        return medication !== undefined;
      }

      return false;
    },

    async listByPatient(
      userId: string,
      patientId: string,
    ): Promise<DocumentRecord[] | null> {
      const hasAccess = await this.hasPatientAccess(userId, patientId);

      if (!hasAccess) {
        return null;
      }

      return sql.unsafe<DocumentRecord[]>(
        `
          select
            ${documentSelectColumns}
          from ${qualifiedDocumentsTable} as d
          where d.patient_id = $1
          order by d.uploaded_at desc, d.id desc
        `,
        [patientId],
      );
    },
  };
};

export type DocumentsRepository = ReturnType<typeof createDocumentsRepository>;
