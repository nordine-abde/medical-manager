import { defineStore } from "pinia";
import type { FacilityUpsertPayload } from "../bookings/types";
import type { DocumentRecord, DocumentType } from "../documents/types";
import {
  createCareEventRequest,
  createCareEventWithRelatedDataRequest,
  deleteCareEventRequest,
  listCareEventSubtypesRequest,
  listCareEventsRequest,
  updateCareEventRequest,
  updateCareEventWithRelatedDataRequest,
} from "./api";
import type {
  CareEventListFilters,
  CareEventPagination,
  CareEventRecord,
  CareEventSubtypesByType,
  CareEventUpsertPayload,
} from "./types";

interface CareEventsState {
  careEvents: CareEventRecord[];
  pagination: CareEventPagination;
  status: "idle" | "loading" | "ready";
  subtypesByType: CareEventSubtypesByType;
}

const emptyCareEventSubtypesByType = (): CareEventSubtypesByType => ({
  exam: [],
  specialist_visit: [],
  treatment: [],
});

const sortCareEvents = (careEvents: CareEventRecord[]): CareEventRecord[] =>
  [...careEvents].sort((left, right) => {
    const dateOrder = right.completedAt.localeCompare(left.completedAt);

    if (dateOrder !== 0) {
      return dateOrder;
    }

    return right.createdAt.localeCompare(left.createdAt);
  });

const upsertCareEvent = (
  careEvents: CareEventRecord[],
  careEvent: CareEventRecord,
): CareEventRecord[] => {
  const existingIndex = careEvents.findIndex(
    (item) => item.id === careEvent.id,
  );

  if (existingIndex === -1) {
    return sortCareEvents([...careEvents, careEvent]);
  }

  return sortCareEvents(
    careEvents.map((item) => (item.id === careEvent.id ? careEvent : item)),
  );
};

let lastPatientId = "";
let lastListFilters: CareEventListFilters = {
  page: 1,
  pageSize: 20,
};

export const useCareEventsStore = defineStore("care-events", {
  state: (): CareEventsState => ({
    careEvents: [],
    pagination: {
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 0,
    },
    status: "idle",
    subtypesByType: emptyCareEventSubtypesByType(),
  }),
  actions: {
    async loadCareEvents(
      patientId: string,
      filters: CareEventListFilters = {},
    ) {
      this.status = "loading";
      lastPatientId = patientId;
      lastListFilters = {
        page: filters.page ?? 1,
        pageSize: filters.pageSize ?? this.pagination.pageSize,
        ...(filters.bookingId ? { bookingId: filters.bookingId } : {}),
        ...(filters.eventType ? { eventType: filters.eventType } : {}),
        ...(filters.facilityId ? { facilityId: filters.facilityId } : {}),
        ...(filters.from ? { from: filters.from } : {}),
        ...(filters.search?.trim() ? { search: filters.search.trim() } : {}),
        ...(filters.subtype?.trim() ? { subtype: filters.subtype.trim() } : {}),
        ...(filters.to ? { to: filters.to } : {}),
      };

      try {
        const result = await listCareEventsRequest(patientId, lastListFilters);
        this.careEvents = sortCareEvents(result.careEvents);
        this.pagination = result.pagination;
        this.status = "ready";
      } catch (error) {
        this.status = "ready";
        throw error;
      }
    },
    async loadCareEventSubtypes(patientId: string) {
      lastPatientId = patientId;
      this.subtypesByType = await listCareEventSubtypesRequest(patientId);
    },
    async loadCareEventsForExport(
      patientId: string,
      filters: CareEventListFilters = {},
    ): Promise<CareEventRecord[]> {
      const pageSize = 100;
      let page = 1;
      const careEvents: CareEventRecord[] = [];

      while (true) {
        const result = await listCareEventsRequest(patientId, {
          ...filters,
          page,
          pageSize,
        });

        careEvents.push(...result.careEvents);

        if (
          result.pagination.totalPages <= page ||
          result.careEvents.length === 0
        ) {
          break;
        }

        page += 1;
      }

      return sortCareEvents(careEvents);
    },
    async refreshCareEvents() {
      if (!lastPatientId) {
        return;
      }

      await this.loadCareEvents(lastPatientId, lastListFilters);
    },
    async refreshCareEventSubtypes() {
      if (!lastPatientId) {
        return;
      }

      await this.loadCareEventSubtypes(lastPatientId);
    },
    async createCareEvent(
      patientId: string,
      payload: CareEventUpsertPayload,
    ): Promise<CareEventRecord> {
      const careEvent = await createCareEventRequest(patientId, payload);
      lastPatientId = patientId;
      await Promise.all([
        this.refreshCareEvents(),
        this.refreshCareEventSubtypes(),
      ]);
      return careEvent;
    },
    async createCareEventWithRelatedData(
      patientId: string,
      payload: {
        attachedDocument?: {
          documentType: DocumentType;
          file: File;
          notes: string | null;
        } | null;
        careEvent: CareEventUpsertPayload;
        facilityPayload?: FacilityUpsertPayload | null;
      },
    ): Promise<{
      careEvent: CareEventRecord;
      document: DocumentRecord | null;
    }> {
      const result = await createCareEventWithRelatedDataRequest(
        patientId,
        payload,
      );
      lastPatientId = patientId;
      await Promise.all([
        this.refreshCareEvents(),
        this.refreshCareEventSubtypes(),
      ]);
      return result;
    },
    async deleteCareEvent(careEventId: string): Promise<CareEventRecord> {
      const careEvent = await deleteCareEventRequest(careEventId);

      if (lastPatientId) {
        await Promise.all([
          this.refreshCareEvents(),
          this.refreshCareEventSubtypes(),
        ]);
      } else {
        this.careEvents = this.careEvents.filter(
          (item) => item.id !== careEventId,
        );
      }

      return careEvent;
    },
    async updateCareEvent(
      careEventId: string,
      payload: Partial<CareEventUpsertPayload>,
    ): Promise<CareEventRecord> {
      const careEvent = await updateCareEventRequest(careEventId, payload);

      if (lastPatientId) {
        await Promise.all([
          this.refreshCareEvents(),
          this.refreshCareEventSubtypes(),
        ]);
      } else {
        this.careEvents = upsertCareEvent(this.careEvents, careEvent);
      }

      return careEvent;
    },
    async updateCareEventWithRelatedData(
      careEventId: string,
      payload: {
        attachedDocument?: {
          documentType: DocumentType;
          file: File;
          notes: string | null;
        } | null;
        careEvent: Partial<CareEventUpsertPayload>;
        facilityPayload?: FacilityUpsertPayload | null;
      },
    ): Promise<{
      careEvent: CareEventRecord;
      document: DocumentRecord | null;
    }> {
      const result = await updateCareEventWithRelatedDataRequest(
        careEventId,
        payload,
      );

      if (lastPatientId) {
        await Promise.all([
          this.refreshCareEvents(),
          this.refreshCareEventSubtypes(),
        ]);
      } else {
        this.careEvents = upsertCareEvent(this.careEvents, result.careEvent);
      }

      return result;
    },
  },
});
