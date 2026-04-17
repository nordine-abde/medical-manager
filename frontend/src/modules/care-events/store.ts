import { defineStore } from "pinia";

import {
  createCareEventRequest,
  listCareEventSubtypesRequest,
  listCareEventsRequest,
  updateCareEventRequest,
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
        ...(filters.taskId ? { taskId: filters.taskId } : {}),
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
    async refreshCareEvents() {
      if (!lastPatientId) {
        return;
      }

      await this.loadCareEvents(lastPatientId);
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
  },
});
