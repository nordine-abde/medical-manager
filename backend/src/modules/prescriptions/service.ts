import { createSqlClient } from "../../db/client";
import { databaseSchemaName } from "../../db/schema";
import {
  createDocumentStorageService,
  type DocumentStorageService,
} from "../documents/storage";
import {
  type CreatePrescriptionDocumentInput,
  type CreatePrescriptionInput,
  createPrescriptionsRepository,
  type PrescriptionListFilters,
  type PrescriptionListResult,
  type PrescriptionRecord,
  type PrescriptionSubtypeOption,
  type PrescriptionsRepository,
  type PrescriptionWithDocumentRecord,
  type UpdatePrescriptionInput,
} from "./repository";

export class PatientPrescriptionAccessError extends Error {
  constructor() {
    super("PATIENT_NOT_FOUND");
  }
}

export class PrescriptionAccessError extends Error {
  constructor() {
    super("PRESCRIPTION_NOT_FOUND");
  }
}

const defaultPrescriptionsRepository = createPrescriptionsRepository(
  createSqlClient(),
  databaseSchemaName,
);
const defaultDocumentStorageService = createDocumentStorageService();

type PrescriptionDocumentRequest = Omit<
  CreatePrescriptionDocumentInput,
  "documentType" | "fileSizeBytes" | "mimeType" | "storedFilename"
> & {
  fileBytes: ArrayBuffer | Uint8Array;
  mimeType: string;
};

export const createPrescriptionsService = (
  repository: PrescriptionsRepository = defaultPrescriptionsRepository,
  storage: DocumentStorageService = defaultDocumentStorageService,
) => ({
  async listPrescriptions(
    userId: string,
    patientId: string,
    filters: PrescriptionListFilters,
  ): Promise<PrescriptionListResult> {
    const result = await repository.listByPatient(userId, patientId, filters);

    if (!result) {
      throw new PatientPrescriptionAccessError();
    }

    return result;
  },

  async listPrescriptionSubtypes(
    userId: string,
    patientId: string,
  ): Promise<PrescriptionSubtypeOption[]> {
    const subtypes = await repository.listSubtypesByPatient(userId, patientId);

    if (!subtypes) {
      throw new PatientPrescriptionAccessError();
    }

    return subtypes;
  },

  async createPrescription(
    userId: string,
    patientId: string,
    input: CreatePrescriptionInput,
  ): Promise<PrescriptionRecord> {
    const createdPrescription = await repository.create(
      userId,
      patientId,
      input,
    );

    if (!createdPrescription) {
      throw new PatientPrescriptionAccessError();
    }

    return createdPrescription;
  },

  async createPrescriptionWithDocument(
    userId: string,
    patientId: string,
    input: CreatePrescriptionInput & {
      document: PrescriptionDocumentRequest;
    },
  ): Promise<PrescriptionWithDocumentRecord> {
    const hasAccess = await repository.hasPatientAccess(userId, patientId);

    if (!hasAccess) {
      throw new PatientPrescriptionAccessError();
    }

    const storedDocument = await storage.storeDocument({
      bytes: input.document.fileBytes,
      mimeType: input.document.mimeType,
    });

    try {
      const result = await repository.createWithDocument(userId, patientId, {
        ...input,
        document: {
          documentType: "prescription",
          fileSizeBytes: storedDocument.fileSizeBytes,
          mimeType: storedDocument.mimeType,
          notes: input.document.notes,
          originalFilename: input.document.originalFilename,
          storedFilename: storedDocument.storagePath,
          uploadedByUserId: userId,
        },
      });

      if (!result) {
        throw new PatientPrescriptionAccessError();
      }

      return result;
    } catch (error) {
      await storage.deleteDocument(storedDocument.storagePath);
      throw error;
    }
  },

  async getPrescription(
    userId: string,
    prescriptionId: string,
  ): Promise<PrescriptionRecord> {
    const prescription = await repository.findAccessibleById(
      userId,
      prescriptionId,
    );

    if (!prescription) {
      throw new PrescriptionAccessError();
    }

    return prescription;
  },

  async deletePrescription(
    userId: string,
    prescriptionId: string,
  ): Promise<PrescriptionRecord> {
    const prescription = await repository.deleteAccessible(
      userId,
      prescriptionId,
    );

    if (!prescription) {
      throw new PrescriptionAccessError();
    }

    return prescription;
  },

  async updatePrescription(
    userId: string,
    prescriptionId: string,
    input: UpdatePrescriptionInput,
  ): Promise<PrescriptionRecord> {
    const prescription = await repository.updateAccessible(
      userId,
      prescriptionId,
      input,
    );

    if (!prescription) {
      throw new PrescriptionAccessError();
    }

    return prescription;
  },

  async updatePrescriptionWithDocument(
    userId: string,
    prescriptionId: string,
    input: UpdatePrescriptionInput & {
      document: PrescriptionDocumentRequest;
    },
  ): Promise<PrescriptionWithDocumentRecord> {
    const existingPrescription = await repository.findAccessibleById(
      userId,
      prescriptionId,
    );

    if (!existingPrescription) {
      throw new PrescriptionAccessError();
    }

    const storedDocument = await storage.storeDocument({
      bytes: input.document.fileBytes,
      mimeType: input.document.mimeType,
    });

    try {
      const result = await repository.updateWithDocument(
        userId,
        prescriptionId,
        {
          ...input,
          document: {
            documentType: "prescription",
            fileSizeBytes: storedDocument.fileSizeBytes,
            mimeType: storedDocument.mimeType,
            notes: input.document.notes,
            originalFilename: input.document.originalFilename,
            storedFilename: storedDocument.storagePath,
            uploadedByUserId: userId,
          },
        },
      );

      if (!result) {
        throw new PrescriptionAccessError();
      }

      return result;
    } catch (error) {
      await storage.deleteDocument(storedDocument.storagePath);
      throw error;
    }
  },
});

export type PrescriptionsService = ReturnType<
  typeof createPrescriptionsService
>;
