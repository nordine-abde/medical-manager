import { defineStore } from "pinia";

import {
  archiveMedicationRequest,
  createMedicationRequest,
  listMedicationsRequest,
  updateMedicationRequest,
} from "./api";
import type {
  MedicationListFilters,
  MedicationRecord,
  MedicationUpsertPayload,
} from "./types";

interface MedicationsState {
  medications: MedicationRecord[];
  status: "idle" | "loading" | "ready";
}

const sortMedications = (medications: MedicationRecord[]): MedicationRecord[] =>
  [...medications].sort((left, right) => {
    const leftDate = left.nextGpContactDate ?? left.updatedAt ?? left.createdAt;
    const rightDate =
      right.nextGpContactDate ?? right.updatedAt ?? right.createdAt;
    const dateOrder = leftDate.localeCompare(rightDate);

    if (dateOrder !== 0) {
      return dateOrder;
    }

    return left.name.localeCompare(right.name);
  });

const upsertMedication = (
  medications: MedicationRecord[],
  medication: MedicationRecord,
): MedicationRecord[] => {
  const existingIndex = medications.findIndex(
    (item) => item.id === medication.id,
  );

  if (existingIndex === -1) {
    return sortMedications([...medications, medication]);
  }

  return sortMedications(
    medications.map((item) => (item.id === medication.id ? medication : item)),
  );
};

let lastPatientId = "";
let lastListFilters: MedicationListFilters = {};

export const useMedicationsStore = defineStore("medications", {
  state: (): MedicationsState => ({
    medications: [],
    status: "idle",
  }),
  getters: {
    activeMedications: (state) =>
      state.medications.filter((medication) => !medication.archived),
  },
  actions: {
    async loadMedications(
      patientId: string,
      filters: MedicationListFilters = {},
    ) {
      this.status = "loading";
      lastPatientId = patientId;
      lastListFilters = {
        includeArchived: filters.includeArchived ?? false,
      };

      try {
        this.medications = sortMedications(
          await listMedicationsRequest(patientId, lastListFilters),
        );
        this.status = "ready";
      } catch (error) {
        this.status = "ready";
        throw error;
      }
    },
    async refreshMedications() {
      if (!lastPatientId) {
        return;
      }

      await this.loadMedications(lastPatientId, lastListFilters);
    },
    async createMedication(
      patientId: string,
      payload: MedicationUpsertPayload,
    ): Promise<MedicationRecord> {
      const medication = await createMedicationRequest(patientId, payload);

      if (lastListFilters.includeArchived || !medication.archived) {
        this.medications = upsertMedication(this.medications, medication);
      }

      return medication;
    },
    async updateMedication(
      medicationId: string,
      payload: Partial<MedicationUpsertPayload>,
    ): Promise<MedicationRecord> {
      const medication = await updateMedicationRequest(medicationId, payload);

      if (lastListFilters.includeArchived || !medication.archived) {
        this.medications = upsertMedication(this.medications, medication);
      } else {
        this.medications = this.medications.filter(
          (item) => item.id !== medicationId,
        );
      }

      return medication;
    },
    async archiveMedication(medicationId: string): Promise<MedicationRecord> {
      const medication = await archiveMedicationRequest(medicationId);

      if (lastListFilters.includeArchived) {
        this.medications = upsertMedication(this.medications, medication);
      } else {
        this.medications = this.medications.filter(
          (item) => item.id !== medicationId,
        );
      }

      return medication;
    },
  },
});
