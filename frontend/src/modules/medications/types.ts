export interface LinkedMedicationPrescriptionRecord {
  collectedAt: string | null;
  createdAt: string;
  deletedAt: string | null;
  expirationDate: string | null;
  id: string;
  issueDate: string | null;
  patientId: string;
  prescriptionType: string;
  receivedAt: string | null;
  requestedAt: string | null;
  status: string;
}

export interface MedicationRecord {
  archived: boolean;
  conditionId: string | null;
  createdAt: string;
  deletedAt: string | null;
  dosage: string;
  id: string;
  linkedPrescriptions: LinkedMedicationPrescriptionRecord[];
  name: string;
  nextGpContactDate: string | null;
  notes: string | null;
  patientId: string;
  prescribingDoctor: string | null;
  quantity: string;
  renewalCadence: string | null;
  updatedAt: string;
}

export interface MedicationListFilters {
  includeArchived?: boolean;
}

export interface MedicationUpsertPayload {
  conditionId: string | null;
  dosage: string;
  name: string;
  nextGpContactDate: string | null;
  notes: string | null;
  prescribingDoctor: string | null;
  quantity: string;
  renewalCadence: string | null;
}
