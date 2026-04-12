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

export interface PatientOverviewMedicationRenewalTaskRecord {
  dueDate: string | null;
  id: string;
  status: string | null;
  title: string | null;
}

export interface PatientOverviewMedicationRecord {
  conditionName: string | null;
  id: string;
  name: string;
  nextGpContactDate: string | null;
  quantity: string;
  renewalCadence: string | null;
  renewalTask: PatientOverviewMedicationRenewalTaskRecord | null;
}

export interface PatientOverviewPrescriptionRecord {
  expirationDate: string | null;
  id: string;
  issueDate: string | null;
  notes: string | null;
  prescriptionType: string;
  status: string;
  taskId: string | null;
}

export interface PatientOverviewAppointmentRecord {
  appointmentAt: string;
  facilityId: string | null;
  id: string;
  prescriptionId: string | null;
  status: string;
  taskId: string;
}

export interface PatientOverviewRecord {
  activeConditions: PatientOverviewConditionRecord[];
  activeMedications: PatientOverviewMedicationRecord[];
  overdueTaskCount: number;
  pendingPrescriptions: PatientOverviewPrescriptionRecord[];
  upcomingAppointments: PatientOverviewAppointmentRecord[];
}

export const patientTimelineEventTypes = [
  "task",
  "medical_instruction",
  "prescription",
  "booking",
  "care_event",
  "medication",
  "document",
] as const;

export type PatientTimelineEventType =
  (typeof patientTimelineEventTypes)[number];

export interface PatientTimelineFilters {
  endDate?: string;
  eventType?: PatientTimelineEventType;
  startDate?: string;
}

export interface PatientTimelineRecord {
  eventDate: string;
  id: string;
  patientId: string;
  relatedEntity: {
    id: string;
    type: PatientTimelineEventType;
  };
  summary: string;
  type: PatientTimelineEventType;
}

export interface GlobalTimelinePatientRecord {
  fullName: string;
  id: string;
}

export interface GlobalTimelineRecord extends PatientTimelineRecord {
  patient: GlobalTimelinePatientRecord;
}

export interface GlobalTimelineFilters extends PatientTimelineFilters {
  patientSearch?: string;
}
