export const careEventTypes = [
  "exam",
  "specialist_visit",
  "treatment",
] as const;

export type CareEventType = (typeof careEventTypes)[number];

export interface CareEventRecord {
  bookingId: string | null;
  completedAt: string;
  createdAt: string;
  eventType: CareEventType;
  facilityId: string | null;
  id: string;
  outcomeNotes: string | null;
  patientId: string;
  providerName: string | null;
  subtype: string | null;
  taskId: string | null;
  updatedAt: string | null;
}

export interface CareEventUpsertPayload {
  bookingId: string | null;
  completedAt: string;
  eventType: CareEventType;
  facilityId: string | null;
  outcomeNotes: string | null;
  providerName: string | null;
  subtype: string | null;
  taskId: string | null;
}
