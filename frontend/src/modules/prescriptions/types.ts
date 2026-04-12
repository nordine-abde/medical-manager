export const prescriptionTypes = [
  "medication",
  "exam",
  "visit",
  "therapy",
] as const;

export type PrescriptionType = (typeof prescriptionTypes)[number];

export const prescriptionStatuses = [
  "needed",
  "requested",
  "available",
  "collected",
  "used",
  "expired",
  "cancelled",
] as const;

export type PrescriptionStatus = (typeof prescriptionStatuses)[number];

export interface PrescriptionRecord {
  collectedAt: string | null;
  createdAt: string;
  deletedAt: string | null;
  expirationDate: string | null;
  id: string;
  issueDate: string | null;
  medicationId: string | null;
  notes: string | null;
  patientId: string;
  prescriptionType: PrescriptionType;
  receivedAt: string | null;
  requestedAt: string | null;
  status: PrescriptionStatus;
  subtype?: string | null;
  taskId: string | null;
  updatedAt: string;
}

export interface PrescriptionListFilters {
  includeArchived?: boolean;
  prescriptionType?: PrescriptionType;
  status?: PrescriptionStatus;
}

export interface PrescriptionStatusPayload {
  collectedAt?: string | null;
  receivedAt?: string | null;
  requestedAt?: string | null;
  status: PrescriptionStatus;
}

export interface PrescriptionUpsertPayload {
  expirationDate: string | null;
  issueDate: string | null;
  notes: string | null;
  prescriptionType: PrescriptionType;
  status: PrescriptionStatus;
  subtype: string | null;
  taskId: string | null;
}
