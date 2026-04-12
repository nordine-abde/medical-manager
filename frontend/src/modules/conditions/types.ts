export interface ConditionRecord {
  active: boolean;
  createdAt: string;
  id: string;
  name: string;
  notes: string | null;
  patientId: string;
  updatedAt: string;
}

export interface ConditionListFilters {
  includeInactive?: boolean;
}

export interface ConditionUpsertPayload {
  active: boolean;
  name: string;
  notes: string | null;
}
