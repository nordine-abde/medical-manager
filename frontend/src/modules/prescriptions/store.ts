import { defineStore } from "pinia";

import {
  createPrescriptionRequest,
  listPrescriptionsRequest,
  updatePrescriptionRequest,
} from "./api";
import type {
  PrescriptionListFilters,
  PrescriptionRecord,
  PrescriptionUpsertPayload,
} from "./types";

interface PrescriptionsState {
  prescriptions: PrescriptionRecord[];
  status: "idle" | "loading" | "ready";
}

const sortPrescriptions = (
  prescriptions: PrescriptionRecord[],
): PrescriptionRecord[] =>
  [...prescriptions].sort((left, right) => {
    const leftDate = left.issueDate ?? left.updatedAt ?? left.createdAt;
    const rightDate = right.issueDate ?? right.updatedAt ?? right.createdAt;
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
    ): Promise<PrescriptionRecord> {
      const prescription = await updatePrescriptionRequest(
        prescriptionId,
        payload,
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
