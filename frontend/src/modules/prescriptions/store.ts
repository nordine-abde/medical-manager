import { defineStore } from "pinia";

import {
  createPrescriptionRequest,
  listPrescriptionsRequest,
  updatePrescriptionRequest,
  updatePrescriptionStatusRequest,
} from "./api";
import type {
  PrescriptionListFilters,
  PrescriptionRecord,
  PrescriptionStatus,
  PrescriptionStatusPayload,
  PrescriptionUpsertPayload,
} from "./types";

interface UpdatePrescriptionOptions {
  statusPayload?: PrescriptionStatusPayload;
}

interface PrescriptionsState {
  prescriptions: PrescriptionRecord[];
  status: "idle" | "loading" | "ready";
}

const sortPrescriptions = (
  prescriptions: PrescriptionRecord[],
): PrescriptionRecord[] =>
  [...prescriptions].sort((left, right) => {
    const leftDate =
      left.issueDate ??
      left.requestedAt ??
      left.receivedAt ??
      left.updatedAt ??
      left.createdAt;
    const rightDate =
      right.issueDate ??
      right.requestedAt ??
      right.receivedAt ??
      right.updatedAt ??
      right.createdAt;
    const dateOrder = rightDate.localeCompare(leftDate);

    if (dateOrder !== 0) {
      return dateOrder;
    }

    return left.prescriptionType.localeCompare(right.prescriptionType);
  });

const upsertPrescription = (
  prescriptions: PrescriptionRecord[],
  prescription: PrescriptionRecord,
): PrescriptionRecord[] => {
  const existingIndex = prescriptions.findIndex(
    (item) => item.id === prescription.id,
  );

  if (existingIndex === -1) {
    return sortPrescriptions([...prescriptions, prescription]);
  }

  return sortPrescriptions(
    prescriptions.map((item) =>
      item.id === prescription.id ? prescription : item,
    ),
  );
};

const matchesFilters = (
  prescription: PrescriptionRecord,
  filters: PrescriptionListFilters,
): boolean => {
  if (!filters.includeArchived && prescription.deletedAt !== null) {
    return false;
  }

  if (
    filters.prescriptionType &&
    prescription.prescriptionType !== filters.prescriptionType
  ) {
    return false;
  }

  if (filters.status && prescription.status !== filters.status) {
    return false;
  }

  return true;
};

let lastPatientId = "";
let lastListFilters: PrescriptionListFilters = {};

export const usePrescriptionsStore = defineStore("prescriptions", {
  state: (): PrescriptionsState => ({
    prescriptions: [],
    status: "idle",
  }),
  actions: {
    async loadPrescriptions(
      patientId: string,
      filters: PrescriptionListFilters = {},
    ) {
      this.status = "loading";
      lastPatientId = patientId;
      lastListFilters = {
        includeArchived: filters.includeArchived ?? false,
        ...(filters.prescriptionType
          ? { prescriptionType: filters.prescriptionType }
          : {}),
        ...(filters.status ? { status: filters.status } : {}),
      };

      try {
        this.prescriptions = sortPrescriptions(
          await listPrescriptionsRequest(patientId, lastListFilters),
        );
        this.status = "ready";
      } catch (error) {
        this.status = "ready";
        throw error;
      }
    },
    async refreshPrescriptions() {
      if (!lastPatientId) {
        return;
      }

      await this.loadPrescriptions(lastPatientId, lastListFilters);
    },
    async createPrescription(
      patientId: string,
      payload: PrescriptionUpsertPayload,
    ): Promise<PrescriptionRecord> {
      const prescription = await createPrescriptionRequest(patientId, payload);

      if (matchesFilters(prescription, lastListFilters)) {
        this.prescriptions = upsertPrescription(
          this.prescriptions,
          prescription,
        );
      }

      return prescription;
    },
    async updatePrescription(
      prescriptionId: string,
      payload: Partial<PrescriptionUpsertPayload>,
      options: UpdatePrescriptionOptions = {},
    ): Promise<PrescriptionRecord> {
      let prescription: PrescriptionRecord | null = null;

      if (Object.keys(payload).length > 0) {
        prescription = await updatePrescriptionRequest(prescriptionId, payload);
      }

      const currentStatus =
        prescription?.status ??
        this.prescriptions.find((item) => item.id === prescriptionId)?.status;

      if (
        options.statusPayload &&
        (currentStatus !== options.statusPayload.status ||
          options.statusPayload.collectedAt !== undefined ||
          options.statusPayload.receivedAt !== undefined ||
          options.statusPayload.requestedAt !== undefined)
      ) {
        prescription = await updatePrescriptionStatusRequest(
          prescriptionId,
          options.statusPayload,
        );
      }

      if (!prescription) {
        throw new Error("No prescription changes were submitted.");
      }

      if (matchesFilters(prescription, lastListFilters)) {
        this.prescriptions = upsertPrescription(
          this.prescriptions,
          prescription,
        );
      } else {
        this.prescriptions = this.prescriptions.filter(
          (item) => item.id !== prescriptionId,
        );
      }

      return prescription;
    },
    async changePrescriptionStatus(
      prescriptionId: string,
      status: PrescriptionStatus,
    ): Promise<PrescriptionRecord> {
      const prescription = await updatePrescriptionStatusRequest(
        prescriptionId,
        { status },
      );

      if (matchesFilters(prescription, lastListFilters)) {
        this.prescriptions = upsertPrescription(
          this.prescriptions,
          prescription,
        );
      } else {
        this.prescriptions = this.prescriptions.filter(
          (item) => item.id !== prescriptionId,
        );
      }

      return prescription;
    },
  },
});
