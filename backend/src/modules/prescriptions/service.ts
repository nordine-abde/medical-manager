import { createSqlClient } from "../../db/client";
import { databaseSchemaName } from "../../db/schema";
import {
  type CreatePrescriptionInput,
  createPrescriptionsRepository,
  type PrescriptionListFilters,
  type PrescriptionRecord,
  type PrescriptionStatus,
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

export class InvalidPrescriptionStatusTransitionError extends Error {
  constructor() {
    super("INVALID_PRESCRIPTION_STATUS_TRANSITION");
  }
}

const defaultPrescriptionsRepository = createPrescriptionsRepository(
  createSqlClient(),
  databaseSchemaName,
);

const nextAllowedStatuses: Record<
  PrescriptionStatus,
  readonly PrescriptionStatus[]
> = {
  available: ["collected", "used", "expired", "cancelled"],
  cancelled: [],
  collected: ["used", "expired", "cancelled"],
  expired: [],
  needed: ["requested", "available", "cancelled", "expired"],
  requested: ["available", "cancelled", "expired"],
  used: [],
};

const normalizeStatusDates = (
  existingPrescription: PrescriptionRecord,
  status: PrescriptionStatus,
  input: {
    collectedAt?: string | null;
    receivedAt?: string | null;
    requestedAt?: string | null;
  },
) => {
  const requestedAt =
    input.requestedAt === undefined
      ? (existingPrescription.requested_at?.toISOString() ?? null)
      : input.requestedAt;
  const receivedAt =
    input.receivedAt === undefined
      ? (existingPrescription.received_at?.toISOString() ?? null)
      : input.receivedAt;
  const collectedAt =
    input.collectedAt === undefined
      ? (existingPrescription.collected_at?.toISOString() ?? null)
      : input.collectedAt;
  const now = new Date().toISOString();

  switch (status) {
    case "requested":
      return {
        collectedAt: null,
        receivedAt: null,
        requestedAt: requestedAt ?? now,
      };
    case "available":
      return {
        collectedAt: null,
        receivedAt: receivedAt ?? now,
        requestedAt,
      };
    case "collected":
      return {
        collectedAt: collectedAt ?? now,
        receivedAt:
          receivedAt ?? existingPrescription.received_at?.toISOString() ?? now,
        requestedAt,
      };
    case "used":
      return {
        collectedAt,
        receivedAt,
        requestedAt,
      };
    case "expired":
    case "cancelled":
    case "needed":
      return {
        collectedAt,
        receivedAt,
        requestedAt,
      };
  }
};

const assertTransitionAllowed = (
  currentStatus: PrescriptionStatus,
  nextStatus: PrescriptionStatus,
): void => {
  if (currentStatus === nextStatus) {
    return;
  }

  if (!nextAllowedStatuses[currentStatus].includes(nextStatus)) {
    throw new InvalidPrescriptionStatusTransitionError();
  }
};

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

  async changePrescriptionStatus(
    userId: string,
    prescriptionId: string,
    input: {
      collectedAt?: string | null;
      receivedAt?: string | null;
      requestedAt?: string | null;
      status: PrescriptionStatus;
    },
  ): Promise<PrescriptionRecord> {
    const existingPrescription = await repository.findAccessibleById(
      userId,
      prescriptionId,
    );

    if (!existingPrescription || existingPrescription.deleted_at) {
      throw new PrescriptionAccessError();
    }

    assertTransitionAllowed(existingPrescription.status, input.status);

    const normalizedDates = normalizeStatusDates(
      existingPrescription,
      input.status,
      input,
    );

    const prescription = await repository.updateStatusAccessible(
      userId,
      prescriptionId,
      {
        status: input.status,
        ...normalizedDates,
      },
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
