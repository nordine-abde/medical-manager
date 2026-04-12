import { createSqlClient } from "../../db/client";
import { databaseSchemaName } from "../../db/schema";
import {
  type CreateMedicationInput,
  createMedicationsRepository,
  type MedicationListFilters,
  type MedicationPrescriptionContext,
  type MedicationRecord,
  type MedicationsRepository,
  type MedicationTaskContext,
  type UpdateMedicationInput,
} from "./repository";

export type MedicationWithContext = {
  linkedPrescriptions: MedicationPrescriptionContext[];
  medication: MedicationRecord;
  renewalTasks: MedicationTaskContext[];
};

export class PatientMedicationAccessError extends Error {
  constructor() {
    super("PATIENT_NOT_FOUND");
  }
}

export class MedicationAccessError extends Error {
  constructor() {
    super("MEDICATION_NOT_FOUND");
  }
}

const defaultMedicationsRepository = createMedicationsRepository(
  createSqlClient(),
  databaseSchemaName,
);

const attachPrescriptionContext = async (
  repository: MedicationsRepository,
  userId: string,
  medications: MedicationRecord[],
): Promise<MedicationWithContext[]> => {
  const linkedPrescriptions =
    await repository.listPrescriptionContextsAccessible(
      userId,
      medications.map((medication) => medication.id),
    );
  const renewalTasks = await repository.listTaskContextsAccessible(
    userId,
    medications.map((medication) => medication.id),
  );
  const linkedPrescriptionsByMedicationId = new Map<
    string,
    MedicationPrescriptionContext[]
  >();
  const renewalTasksByMedicationId = new Map<string, MedicationTaskContext[]>();

  for (const linkedPrescription of linkedPrescriptions) {
    const medicationId = linkedPrescription.medication_id;

    if (!medicationId) {
      continue;
    }

    const existingContexts =
      linkedPrescriptionsByMedicationId.get(medicationId) ?? [];
    existingContexts.push(linkedPrescription);
    linkedPrescriptionsByMedicationId.set(medicationId, existingContexts);
  }

  for (const renewalTask of renewalTasks) {
    const medicationId = renewalTask.medication_id;

    if (!medicationId) {
      continue;
    }

    const existingTasks = renewalTasksByMedicationId.get(medicationId) ?? [];
    existingTasks.push(renewalTask);
    renewalTasksByMedicationId.set(medicationId, existingTasks);
  }

  return medications.map((medication) => ({
    linkedPrescriptions:
      linkedPrescriptionsByMedicationId.get(medication.id) ?? [],
    medication,
    renewalTasks: renewalTasksByMedicationId.get(medication.id) ?? [],
  }));
};

const attachSingleMedication = async (
  repository: MedicationsRepository,
  userId: string,
  medication: MedicationRecord,
): Promise<MedicationWithContext> => {
  const [medicationWithContext] = await attachPrescriptionContext(
    repository,
    userId,
    [medication],
  );

  if (!medicationWithContext) {
    throw new Error("Expected medication context to be attached");
  }

  return medicationWithContext;
};

export const createMedicationsService = (
  repository: MedicationsRepository = defaultMedicationsRepository,
) => ({
  async archiveMedication(
    userId: string,
    medicationId: string,
  ): Promise<MedicationWithContext> {
    const medication = await repository.setArchivedState(
      userId,
      medicationId,
      true,
    );

    if (!medication) {
      throw new MedicationAccessError();
    }

    return attachSingleMedication(repository, userId, medication);
  },

  async createMedication(
    userId: string,
    patientId: string,
    input: CreateMedicationInput,
  ): Promise<MedicationWithContext> {
    const medication = await repository.create(userId, patientId, input);

    if (!medication) {
      throw new PatientMedicationAccessError();
    }

    return attachSingleMedication(repository, userId, medication);
  },

  async getMedication(
    userId: string,
    medicationId: string,
  ): Promise<MedicationWithContext> {
    const medication = await repository.findAccessibleById(
      userId,
      medicationId,
    );

    if (!medication) {
      throw new MedicationAccessError();
    }

    return attachSingleMedication(repository, userId, medication);
  },

  async listMedications(
    userId: string,
    patientId: string,
    filters: MedicationListFilters,
  ): Promise<MedicationWithContext[]> {
    const medications = await repository.listByPatient(
      userId,
      patientId,
      filters,
    );

    if (!medications) {
      throw new PatientMedicationAccessError();
    }

    return attachPrescriptionContext(repository, userId, medications);
  },

  async updateMedication(
    userId: string,
    medicationId: string,
    input: UpdateMedicationInput,
  ): Promise<MedicationWithContext> {
    const medication = await repository.updateAccessible(
      userId,
      medicationId,
      input,
    );

    if (!medication) {
      throw new MedicationAccessError();
    }

    return attachSingleMedication(repository, userId, medication);
  },
});

export type MedicationsService = ReturnType<typeof createMedicationsService>;
