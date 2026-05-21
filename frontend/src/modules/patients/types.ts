export interface PatientRecord {
  archived: boolean;
  createdAt: string;
  dateOfBirth: string | null;
  deletedAt: string | null;
  fullName: string;
  id: string;
  notes: string | null;
  updatedAt: string;
}

export interface PatientUserRecord {
  email: string;
  fullName: string;
  id: string;
  linkedAt: string;
}

export interface PatientListFilters {
  includeArchived?: boolean;
  search?: string;
}

export interface PatientUpsertPayload {
  dateOfBirth: string | null;
  fullName: string;
  notes: string | null;
}
