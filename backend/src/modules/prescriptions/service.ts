import { createSqlClient } from "../../db/client";
import { databaseSchemaName } from "../../db/schema";
import {
  type CreatePrescriptionInput,
  createPrescriptionsRepository,
  type PrescriptionListFilters,
  type PrescriptionRecord,
  type PrescriptionsRepository,
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

export const createPrescriptionsService = (
  repository: PrescriptionsRepository = defaultPrescriptionsRepository,
) => ({
  async listPrescriptions(
    userId: string,
    patientId: string,
    filters: PrescriptionListFilters,
  ): Promise<PrescriptionRecord[]> {
    const prescriptions = await repository.listByPatient(
      userId,
      patientId,
      filters,
    );

    if (!prescriptions) {
      throw new PatientPrescriptionAccessError();
    }

    return prescriptions;
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
});

export type PrescriptionsService = ReturnType<
  typeof createPrescriptionsService
>;
