export const bookingStatuses = [
  "not_booked",
  "booking_in_progress",
  "booked",
  "completed",
  "cancelled",
] as const;

export type BookingStatus = (typeof bookingStatuses)[number];

export interface FacilityRecord {
  address: string | null;
  city: string | null;
  createdAt: string;
  facilityType: string | null;
  id: string;
  name: string;
  notes: string | null;
  updatedAt: string;
}

export interface FacilityUpsertPayload {
  address: string | null;
  city: string | null;
  facilityType: string | null;
  name: string;
  notes: string | null;
}

export interface BookingRecord {
  appointmentAt: string | null;
  bookedAt: string | null;
  createdAt: string;
  deletedAt: string | null;
  facilityId: string | null;
  id: string;
  notes: string | null;
  patientId: string;
  prescriptionId: string | null;
  status: BookingStatus;
  taskId: string;
  updatedAt: string;
}

export interface BookingListFilters {
  facilityId?: string;
  from?: string;
  includeArchived?: boolean;
  status?: BookingStatus;
  to?: string;
}

export interface BookingStatusPayload {
  appointmentAt?: string | null;
  bookedAt?: string | null;
  status: BookingStatus;
}

export interface BookingUpsertPayload {
  appointmentAt: string | null;
  bookedAt: string | null;
  facilityId: string | null;
  notes: string | null;
  prescriptionId: string | null;
  status: BookingStatus;
  taskId: string;
}
