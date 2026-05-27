import { defineStore } from "pinia";
import type { DocumentRecord } from "../documents/types";
import {
  createPrescriptionRequest,
  createPrescriptionWithDocumentRequest,
  listPrescriptionsRequest,
  updatePrescriptionRequest,
  updatePrescriptionWithDocumentRequest,
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
    async createPrescriptionWithDocument(
      patientId: string,
      payload: {
        document: {
          file: File;
          notes: string | null;
        };
        prescription: PrescriptionUpsertPayload;
      },
    ): Promise<{ document: DocumentRecord; prescription: PrescriptionRecord }> {
      const result = await createPrescriptionWithDocumentRequest(
        patientId,
        payload,
      );

      if (matchesFilters(result.prescription, lastListFilters)) {
        this.prescriptions = upsertPrescription(
          this.prescriptions,
          result.prescription,
        );
      }

      return result;
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
    async updatePrescriptionWithDocument(
      prescriptionId: string,
      payload: {
        document: {
          file: File;
          notes: string | null;
        };
        prescription: Partial<PrescriptionUpsertPayload>;
      },
    ): Promise<{ document: DocumentRecord; prescription: PrescriptionRecord }> {
      const result = await updatePrescriptionWithDocumentRequest(
        prescriptionId,
        payload,
      );

      if (matchesFilters(result.prescription, lastListFilters)) {
        this.prescriptions = upsertPrescription(
          this.prescriptions,
          result.prescription,
        );
      } else {
        this.prescriptions = this.prescriptions.filter(
          (item) => item.id !== prescriptionId,
        );
      }

      return result;
    },
  },
});
