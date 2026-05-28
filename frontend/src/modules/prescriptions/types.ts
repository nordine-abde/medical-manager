export const prescriptionTypes = [
  "exam",
  "visit",
  "therapy",
  "medication",
] as const;

export type PrescriptionType = (typeof prescriptionTypes)[number];

export interface PrescriptionRecord {
  createdAt: string;
  deletedAt: string | null;
  expirationDate: string | null;
  id: string;
  issueDate: string | null;
  notes: string | null;
  patientId: string;
  prescriptionType: PrescriptionType;
  subtype?: string | null;
  updatedAt: string;
}

export interface PrescriptionListFilters {
  from?: string;
  hideBooked?: boolean;
  includeArchived?: boolean;
  page?: number;
  pageSize?: number;
  prescriptionType?: PrescriptionType;
  search?: string;
  subtype?: string;
  to?: string;
}

export interface PrescriptionPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PrescriptionListResult {
  pagination: PrescriptionPagination;
  prescriptions: PrescriptionRecord[];
}

export type PrescriptionSubtypesByType = Record<PrescriptionType, string[]>;

export interface PrescriptionUpsertPayload {
  expirationDate: string | null;
  issueDate: string | null;
  notes: string | null;
  prescriptionType: PrescriptionType;
  subtype: string | null;
}
