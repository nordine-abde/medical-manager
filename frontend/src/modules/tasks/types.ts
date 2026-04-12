export const taskStatuses = [
  "pending",
  "blocked",
  "scheduled",
  "completed",
  "cancelled",
  "deferred",
] as const;

export type TaskStatus = (typeof taskStatuses)[number];
export type TaskWorkflowStatus = Exclude<TaskStatus, "blocked">;

export const globalTaskStates = [
  "pending",
  "blocked",
  "overdue",
  "upcoming",
  "completed",
] as const;

export type GlobalTaskState = (typeof globalTaskStates)[number];

export const taskWorkflowStatuses: TaskWorkflowStatus[] = [
  "pending",
  "scheduled",
  "completed",
  "cancelled",
  "deferred",
];

export interface TaskRecord {
  autoRecurrenceEnabled: boolean;
  blockedByTaskIds: string[];
  completedAt: string | null;
  conditionId: string | null;
  createdAt: string;
  deletedAt: string | null;
  description: string | null;
  dueDate: string | null;
  id: string;
  medicalInstructionId: string | null;
  patientId: string;
  recurrenceRule: string | null;
  scheduledAt: string | null;
  status: TaskStatus;
  taskType: string;
  title: string;
  updatedAt: string;
}

export interface GlobalTaskPatientRecord {
  fullName: string;
  id: string;
}

export interface GlobalTaskRecord {
  patient: GlobalTaskPatientRecord;
  task: TaskRecord;
}

export interface TaskListFilters {
  includeArchived?: boolean;
}

export interface GlobalTaskListFilters extends TaskListFilters {
  state?: GlobalTaskState;
}

export interface TaskUpsertPayload {
  conditionId: string | null;
  description: string | null;
  dueDate: string | null;
  medicalInstructionId: string | null;
  scheduledAt: string | null;
  taskType: string;
  title: string;
}
