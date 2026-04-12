export const instructionStatuses = [
  "active",
  "fulfilled",
  "superseded",
  "cancelled",
] as const;

export type InstructionStatus = (typeof instructionStatuses)[number];

export interface InstructionRecord {
  careEventId?: string | null;
  createdAt: string;
  createdByUserId: string;
  doctorName: string | null;
  id: string;
  instructionDate: string;
  originalNotes: string;
  patientId: string;
  specialty: string | null;
  status: InstructionStatus;
  targetTimingText: string | null;
  updatedAt: string;
}

export interface InstructionListFilters {
  from?: string;
  status?: InstructionStatus;
  to?: string;
}

export interface InstructionUpsertPayload {
  careEventId?: string | null;
  doctorName: string | null;
  instructionDate: string;
  originalNotes: string;
  specialty: string | null;
  status: InstructionStatus;
  targetTimingText: string | null;
}
