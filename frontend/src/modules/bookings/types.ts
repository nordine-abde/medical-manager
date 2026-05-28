import type { DocumentType } from "../documents/types";
import type { PrescriptionType } from "../prescriptions/types";

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
  title: string;
  updatedAt: string;
}

export interface BookingListFilters {
  facilityId?: string;
  from?: string;
  hideCompleted?: boolean;
  includeArchived?: boolean;
  page?: number;
  pageSize?: number;
  prescriptionId?: string;
  prescriptionType?: PrescriptionType;
  search?: string;
  subtype?: string;
  to?: string;
}

export interface BookingPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface BookingListResult {
  bookings: BookingRecord[];
  pagination: BookingPagination;
}

export interface BookingUpsertPayload {
  appointmentAt: string | null;
  bookedAt: string | null;
  facility?: FacilityUpsertPayload | null;
  facilityId: string | null;
  notes: string | null;
  prescriptionId: string | null;
  title: string;
}

export interface BookingAttachedDocumentPayload {
  documentType: DocumentType;
  file: File;
  notes: string | null;
}
