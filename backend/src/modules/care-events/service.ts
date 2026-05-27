import { createSqlClient } from "../../db/client";
import { databaseSchemaName } from "../../db/schema";
import {
  createDocumentStorageService,
  type DocumentStorageService,
} from "../documents/storage";
import type { CreateFacilityInput } from "../facilities/repository";
import {
  type CareEventListFilters,
  type CareEventListResult,
  type CareEventRecord,
  type CareEventSubtypeOption,
  type CareEventsRepository,
  type CareEventWithDocumentRecord,
  type CreateCareEventDocumentInput,
  type CreateCareEventInput,
  createCareEventsRepository,
  type UpdateCareEventInput,
} from "./repository";

export class PatientCareEventAccessError extends Error {
  constructor() {
    super("PATIENT_NOT_FOUND");
  }
}

export class CareEventAccessError extends Error {
  constructor() {
    super("CARE_EVENT_NOT_FOUND");
  }
}

const defaultCareEventsRepository = createCareEventsRepository(
  createSqlClient(),
  databaseSchemaName,
);
const defaultDocumentStorageService = createDocumentStorageService();

type CareEventDocumentRequest = Omit<
  CreateCareEventDocumentInput,
  "fileSizeBytes" | "mimeType" | "storedFilename"
> & {
  fileBytes: ArrayBuffer | Uint8Array;
  mimeType: string;
};

export const createCareEventsService = (
  repository: CareEventsRepository = defaultCareEventsRepository,
  storage: DocumentStorageService = defaultDocumentStorageService,
) => ({
  async createCareEvent(
    userId: string,
    patientId: string,
    input: CreateCareEventInput,
  ): Promise<CareEventRecord> {
    const careEvent = await repository.create(userId, patientId, input);

    if (!careEvent) {
      throw new PatientCareEventAccessError();
    }

    return careEvent;
  },

  async createCareEventWithRelatedData(
    userId: string,
    patientId: string,
    input: CreateCareEventInput & {
      document?: CareEventDocumentRequest | null;
      facility?: CreateFacilityInput | null;
    },
  ): Promise<CareEventWithDocumentRecord> {
    const storedDocument = input.document
      ? await storage.storeDocument({
          bytes: input.document.fileBytes,
          mimeType: input.document.mimeType,
        })
      : null;

    try {
      const result = await repository.createWithRelatedData(userId, patientId, {
        ...input,
        document:
          input.document && storedDocument
            ? {
                documentType: input.document.documentType,
                fileSizeBytes: storedDocument.fileSizeBytes,
                mimeType: storedDocument.mimeType,
                notes: input.document.notes,
                originalFilename: input.document.originalFilename,
                storedFilename: storedDocument.storagePath,
                uploadedByUserId: userId,
              }
            : null,
      });

      if (!result) {
        throw new PatientCareEventAccessError();
      }

      return result;
    } catch (error) {
      if (storedDocument) {
        await storage.deleteDocument(storedDocument.storagePath);
      }

      throw error;
    }
  },

  async getCareEvent(
    userId: string,
    careEventId: string,
  ): Promise<CareEventRecord> {
    const careEvent = await repository.findAccessibleById(userId, careEventId);

    if (!careEvent) {
      throw new CareEventAccessError();
    }

    return careEvent;
  },

  async listCareEvents(
    userId: string,
    patientId: string,
    filters: CareEventListFilters,
  ): Promise<CareEventListResult> {
    const careEvents = await repository.listByPatient(
      userId,
      patientId,
      filters,
    );

    if (!careEvents) {
      throw new PatientCareEventAccessError();
    }

    return careEvents;
  },

  async listCareEventSubtypes(
    userId: string,
    patientId: string,
  ): Promise<CareEventSubtypeOption[]> {
    const subtypes = await repository.listSubtypesByPatient(userId, patientId);

    if (!subtypes) {
      throw new PatientCareEventAccessError();
    }

    return subtypes;
  },

  async updateCareEvent(
    userId: string,
    careEventId: string,
    input: UpdateCareEventInput,
  ): Promise<CareEventRecord> {
    const careEvent = await repository.updateAccessible(
      userId,
      careEventId,
      input,
    );

    if (!careEvent) {
      throw new CareEventAccessError();
    }

    return careEvent;
  },

  async updateCareEventWithRelatedData(
    userId: string,
    careEventId: string,
    input: UpdateCareEventInput & {
      document?: CareEventDocumentRequest | null;
      facility?: CreateFacilityInput | null;
    },
  ): Promise<CareEventWithDocumentRecord> {
    const storedDocument = input.document
      ? await storage.storeDocument({
          bytes: input.document.fileBytes,
          mimeType: input.document.mimeType,
        })
      : null;

    try {
      const result = await repository.updateWithRelatedData(
        userId,
        careEventId,
        {
          ...input,
          document:
            input.document && storedDocument
              ? {
                  documentType: input.document.documentType,
                  fileSizeBytes: storedDocument.fileSizeBytes,
                  mimeType: storedDocument.mimeType,
                  notes: input.document.notes,
                  originalFilename: input.document.originalFilename,
                  storedFilename: storedDocument.storagePath,
                  uploadedByUserId: userId,
                }
              : null,
        },
      );

      if (!result) {
        throw new CareEventAccessError();
      }

      return result;
    } catch (error) {
      if (storedDocument) {
        await storage.deleteDocument(storedDocument.storagePath);
      }

      throw error;
    }
  },
});

export type CareEventsService = ReturnType<typeof createCareEventsService>;
