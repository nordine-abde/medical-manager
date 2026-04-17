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

export interface CareEventListFilters {
  bookingId?: string;
  eventType?: CareEventType;
  facilityId?: string;
  from?: string;
  page?: number;
  pageSize?: number;
  search?: string;
  subtype?: string;
  taskId?: string;
  to?: string;
}

export interface CareEventPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface CareEventListResult {
  careEvents: CareEventRecord[];
  pagination: CareEventPagination;
}
