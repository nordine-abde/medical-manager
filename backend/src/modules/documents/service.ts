import { createSqlClient } from "../../db/client";
import { databaseSchemaName } from "../../db/schema";
import {
  type CreateDocumentInput,
  createDocumentsRepository,
  type DocumentRecord,
  type DocumentsRepository,
} from "./repository";
import {
  createDocumentStorageService,
  type DocumentStorageService,
} from "./storage";

export class PatientDocumentAccessError extends Error {
  constructor() {
    super("PATIENT_NOT_FOUND");
  }
}

export class DocumentAccessError extends Error {
  constructor() {
    super("DOCUMENT_NOT_FOUND");
  }
}

export class RelatedEntityNotFoundError extends Error {
  constructor() {
    super("RELATED_ENTITY_NOT_FOUND");
  }
}

const defaultDocumentsRepository = createDocumentsRepository(
  createSqlClient(),
  databaseSchemaName,
);

const defaultDocumentStorageService = createDocumentStorageService();

type CreateDocumentRequest = Omit<
  CreateDocumentInput,
  | "fileSizeBytes"
  | "mimeType"
  | "patientId"
  | "storedFilename"
  | "uploadedByUserId"
> & {
  fileBytes: ArrayBuffer | Uint8Array;
  mimeType: string;
  originalFilename: string;
};

export const createDocumentsService = (
  repository: DocumentsRepository = defaultDocumentsRepository,
  storage: DocumentStorageService = defaultDocumentStorageService,
) => ({
  async createDocument(
    userId: string,
    patientId: string,
    input: CreateDocumentRequest,
  ): Promise<DocumentRecord> {
    const hasAccess = await repository.hasPatientAccess(userId, patientId);

    if (!hasAccess) {
      throw new PatientDocumentAccessError();
    }

    const hasValidRelatedEntity = await repository.hasValidRelatedEntity(
      patientId,
      input.relatedEntityType,
      input.relatedEntityId,
    );

    if (!hasValidRelatedEntity) {
      throw new RelatedEntityNotFoundError();
    }

    const storedDocument = await storage.storeDocument({
      bytes: input.fileBytes,
      mimeType: input.mimeType,
    });

    try {
      return await repository.create({
        documentType: input.documentType,
        fileSizeBytes: storedDocument.fileSizeBytes,
        mimeType: storedDocument.mimeType,
        notes: input.notes,
        originalFilename: input.originalFilename,
        patientId,
        relatedEntityId: input.relatedEntityId,
        relatedEntityType: input.relatedEntityType,
        storedFilename: storedDocument.storagePath,
        uploadedByUserId: userId,
      });
    } catch (error) {
      await storage.deleteDocument(storedDocument.storagePath);
      throw error;
    }
  },

  async downloadDocument(
    userId: string,
    documentId: string,
  ): Promise<{ bytes: Uint8Array; document: DocumentRecord }> {
    const document = await repository.findAccessibleById(userId, documentId);

    if (!document) {
      throw new DocumentAccessError();
    }

    const bytes = await storage.readDocument(document.stored_filename);

    return {
      bytes,
      document,
    };
  },

  async getDocument(
    userId: string,
    documentId: string,
  ): Promise<DocumentRecord> {
    const document = await repository.findAccessibleById(userId, documentId);

    if (!document) {
      throw new DocumentAccessError();
    }

    return document;
  },

  async listDocuments(
    userId: string,
    patientId: string,
  ): Promise<DocumentRecord[]> {
    const documents = await repository.listByPatient(userId, patientId);

    if (!documents) {
      throw new PatientDocumentAccessError();
    }

    return documents;
  },
});

export type DocumentsService = ReturnType<typeof createDocumentsService>;
