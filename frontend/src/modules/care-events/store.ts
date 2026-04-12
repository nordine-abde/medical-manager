import { defineStore } from "pinia";

import {
  createCareEventRequest,
  listCareEventsRequest,
  updateCareEventRequest,
} from "./api";
import type { CareEventRecord, CareEventUpsertPayload } from "./types";

interface CareEventsState {
  careEvents: CareEventRecord[];
  status: "idle" | "loading" | "ready";
}

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

export const useCareEventsStore = defineStore("care-events", {
  state: (): CareEventsState => ({
    careEvents: [],
    status: "idle",
  }),
  actions: {
    async loadCareEvents(patientId: string) {
      this.status = "loading";
      lastPatientId = patientId;

      try {
        this.careEvents = sortCareEvents(
          await listCareEventsRequest(patientId),
        );
        this.status = "ready";
      } catch (error) {
        this.status = "ready";
        throw error;
      }
    },
    async refreshCareEvents() {
      if (!lastPatientId) {
        return;
      }

      await this.loadCareEvents(lastPatientId);
    },
    async createCareEvent(
      patientId: string,
      payload: CareEventUpsertPayload,
    ): Promise<CareEventRecord> {
      const careEvent = await createCareEventRequest(patientId, payload);
      this.careEvents = upsertCareEvent(this.careEvents, careEvent);
      return careEvent;
    },
    async updateCareEvent(
      careEventId: string,
      payload: Partial<CareEventUpsertPayload>,
    ): Promise<CareEventRecord> {
      const careEvent = await updateCareEventRequest(careEventId, payload);
      this.careEvents = upsertCareEvent(this.careEvents, careEvent);
      return careEvent;
    },
  },
});
