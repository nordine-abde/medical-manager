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

export interface PatientOverviewConditionRecord {
  id: string;
  name: string;
  notes: string | null;
}

export interface PatientOverviewMedicationRecord {
  conditionName: string | null;
  id: string;
  name: string;
  nextGpContactDate: string | null;
  quantity: string;
  renewalCadence: string | null;
}

export interface PatientOverviewPrescriptionRecord {
  expirationDate: string | null;
  id: string;
  issueDate: string | null;
  notes: string | null;
  prescriptionType: string;
  status: string;
}

export interface PatientOverviewAppointmentRecord {
  appointmentAt: string;
  facilityId: string | null;
  id: string;
  prescriptionId: string | null;
  status: string;
}

export interface PatientOverviewRecord {
  activeConditions: PatientOverviewConditionRecord[];
  activeMedications: PatientOverviewMedicationRecord[];
  pendingPrescriptions: PatientOverviewPrescriptionRecord[];
  upcomingAppointments: PatientOverviewAppointmentRecord[];
}
