import { defineStore } from "pinia";
import type { DocumentRecord } from "../documents/types";
import {
  createPrescriptionRequest,
  createPrescriptionWithDocumentRequest,
  deletePrescriptionRequest,
  listPrescriptionSubtypesRequest,
  listPrescriptionsRequest,
  updatePrescriptionRequest,
  updatePrescriptionWithDocumentRequest,
} from "./api";
import type {
  PrescriptionListFilters,
  PrescriptionPagination,
  PrescriptionRecord,
  PrescriptionSubtypesByType,
  PrescriptionUpsertPayload,
} from "./types";

interface PrescriptionsState {
  pagination: PrescriptionPagination;
  prescriptions: PrescriptionRecord[];
  status: "idle" | "loading" | "ready";
  subtypesByType: PrescriptionSubtypesByType;
}

const emptyPrescriptionSubtypesByType = (): PrescriptionSubtypesByType => ({
  exam: [],
  medication: [],
  therapy: [],
  visit: [],
});

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

let lastPatientId = "";
let lastListFilters: PrescriptionListFilters = {
  includeArchived: false,
  page: 1,
  pageSize: 20,
};

export const usePrescriptionsStore = defineStore("prescriptions", {
  state: (): PrescriptionsState => ({
    pagination: {
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 0,
    },
    prescriptions: [],
    status: "idle",
    subtypesByType: emptyPrescriptionSubtypesByType(),
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
        page: filters.page ?? 1,
        pageSize: filters.pageSize ?? this.pagination.pageSize,
        ...(filters.from ? { from: filters.from } : {}),
        ...(filters.prescriptionType
          ? { prescriptionType: filters.prescriptionType }
          : {}),
        ...(filters.search?.trim() ? { search: filters.search.trim() } : {}),
        ...(filters.subtype?.trim() ? { subtype: filters.subtype.trim() } : {}),
        ...(filters.to ? { to: filters.to } : {}),
      };

      try {
        const result = await listPrescriptionsRequest(
          patientId,
          lastListFilters,
        );
        this.prescriptions = sortPrescriptions(result.prescriptions);
        this.pagination = result.pagination;
        this.status = "ready";
      } catch (error) {
        this.status = "ready";
        throw error;
      }
    },
    async loadPrescriptionSubtypes(patientId: string) {
      lastPatientId = patientId;
      this.subtypesByType = await listPrescriptionSubtypesRequest(patientId);
    },
    async refreshPrescriptions() {
      if (!lastPatientId) {
        return;
      }

      await this.loadPrescriptions(lastPatientId, lastListFilters);
    },
    async refreshPrescriptionSubtypes() {
      if (!lastPatientId) {
        return;
      }

      await this.loadPrescriptionSubtypes(lastPatientId);
    },
    async deletePrescription(
      prescriptionId: string,
    ): Promise<PrescriptionRecord> {
      const prescription = await deletePrescriptionRequest(prescriptionId);

      if (lastPatientId) {
        await Promise.all([
          this.refreshPrescriptions(),
          this.refreshPrescriptionSubtypes(),
        ]);
      } else {
        this.prescriptions = this.prescriptions.filter(
          (item) => item.id !== prescriptionId,
        );
      }

      return prescription;
    },
    async createPrescription(
      patientId: string,
      payload: PrescriptionUpsertPayload,
    ): Promise<PrescriptionRecord> {
      const prescription = await createPrescriptionRequest(patientId, payload);
      lastPatientId = patientId;

      await Promise.all([
        this.refreshPrescriptions(),
        this.refreshPrescriptionSubtypes(),
      ]);

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
      lastPatientId = patientId;

      await Promise.all([
        this.refreshPrescriptions(),
        this.refreshPrescriptionSubtypes(),
      ]);

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

      if (lastPatientId) {
        await Promise.all([
          this.refreshPrescriptions(),
          this.refreshPrescriptionSubtypes(),
        ]);
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

      if (lastPatientId) {
        await Promise.all([
          this.refreshPrescriptions(),
          this.refreshPrescriptionSubtypes(),
        ]);
      }

      return result;
    },
  },
});
