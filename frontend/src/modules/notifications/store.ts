import { defineStore } from "pinia";

import {
  getNotificationSettingsRequest,
  type NotificationLogRecord,
  processNotificationDeliveriesRequest,
  updateNotificationSettingsRequest,
} from "./api";
import type {
  NotificationSettingsRecord,
  UpdateNotificationSettingsPayload,
} from "./types";

interface NotificationsState {
  currentSettings: NotificationSettingsRecord | null;
  lastProcessedNotifications: NotificationLogRecord[];
  status: "idle" | "loading" | "ready";
}

export const useNotificationsStore = defineStore("notifications", {
  state: (): NotificationsState => ({
    currentSettings: null,
    lastProcessedNotifications: [],
    status: "idle",
  }),
  actions: {
    async loadPatientSettings(patientId: string) {
      this.status = "loading";

      try {
        this.currentSettings = await getNotificationSettingsRequest(patientId);
        this.status = "ready";
        return this.currentSettings;
      } catch (error) {
        this.status = "ready";
        throw error;
      }
    },
    async updatePatientSettings(
      patientId: string,
      payload: UpdateNotificationSettingsPayload,
    ) {
      this.currentSettings = await updateNotificationSettingsRequest(
        patientId,
        payload,
      );
      return this.currentSettings;
    },
    async processPendingNotifications() {
      this.lastProcessedNotifications =
        await processNotificationDeliveriesRequest();
      return this.lastProcessedNotifications;
    },
  },
});
