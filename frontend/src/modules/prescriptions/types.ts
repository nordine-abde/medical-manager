export const prescriptionTypes = ["exam", "visit", "therapy"] as const;

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
  includeArchived?: boolean;
  prescriptionType?: PrescriptionType;
}

export interface PrescriptionUpsertPayload {
  expirationDate: string | null;
  issueDate: string | null;
  notes: string | null;
  prescriptionType: PrescriptionType;
  subtype: string | null;
}
