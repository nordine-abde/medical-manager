import { Elysia, t } from "elysia";

import type { auth } from "../../auth";
import { requireRequestSession } from "../../auth/session";
import {
  type GlobalTaskState,
  globalTaskStates,
  type TaskStatus,
  taskStatuses,
} from "./repository";
import {
  createTasksService,
  PatientTaskAccessError,
  TaskAccessError,
  TaskDependencyCycleError,
  TaskIncompleteDependenciesError,
} from "./service";

const taskStatusSchema = t.Union(
  taskStatuses.map((status) => t.Literal(status)),
);

const globalTaskStateSchema = t.Union(
  globalTaskStates.map((state) => t.Literal(state)),
);

const dateOnlySchema = t.String({
  pattern: "^\\d{4}-\\d{2}-\\d{2}$",
});

const dateTimeSchema = t.String({
  format: "date-time",
});

const taskBodySchema = t.Object({
  autoRecurrenceEnabled: t.Optional(t.Boolean()),
  conditionId: t.Optional(
    t.Nullable(
      t.String({
        format: "uuid",
      }),
    ),
  ),
  description: t.Optional(t.Nullable(t.String())),
  dueDate: t.Optional(t.Nullable(dateOnlySchema)),
  medicationId: t.Optional(
    t.Nullable(
      t.String({
        format: "uuid",
      }),
    ),
  ),
  medicalInstructionId: t.Optional(
    t.Nullable(
      t.String({
        format: "uuid",
      }),
    ),
  ),
  recurrenceRule: t.Optional(t.Nullable(t.String())),
  scheduledAt: t.Optional(t.Nullable(dateTimeSchema)),
  status: t.Optional(taskStatusSchema),
  taskType: t.String({
    minLength: 1,
  }),
  title: t.String({
    minLength: 1,
  }),
});

const taskUpdateBodySchema = t.Object({
  autoRecurrenceEnabled: t.Optional(t.Boolean()),
  conditionId: t.Optional(
    t.Nullable(
      t.String({
        format: "uuid",
      }),
    ),
  ),
  description: t.Optional(t.Nullable(t.String())),
  dueDate: t.Optional(t.Nullable(dateOnlySchema)),
  medicationId: t.Optional(
    t.Nullable(
      t.String({
        format: "uuid",
      }),
    ),
  ),
  medicalInstructionId: t.Optional(
    t.Nullable(
      t.String({
        format: "uuid",
      }),
    ),
  ),
  recurrenceRule: t.Optional(t.Nullable(t.String())),
  scheduledAt: t.Optional(t.Nullable(dateTimeSchema)),
  taskType: t.Optional(
    t.String({
      minLength: 1,
    }),
  ),
  title: t.Optional(
    t.String({
      minLength: 1,
    }),
  ),
});

const taskStatusBodySchema = t.Object({
  status: taskStatusSchema,
});

const taskDependencyBodySchema = t.Object({
  dependsOnTaskId: t.String({
    format: "uuid",
  }),
});

const patientIdParamsSchema = t.Object({
  patientId: t.String({
    format: "uuid",
  }),
});

const taskIdParamsSchema = t.Object({
  taskId: t.String({
    format: "uuid",
  }),
});

const taskDependencyParamsSchema = t.Object({
  dependsOnTaskId: t.String({
    format: "uuid",
  }),
  taskId: t.String({
    format: "uuid",
  }),
});

const taskListQuerySchema = t.Object({
  includeArchived: t.Optional(t.Union([t.Literal("true"), t.Literal("false")])),
});

const globalTaskListQuerySchema = t.Object({
  includeArchived: t.Optional(t.Union([t.Literal("true"), t.Literal("false")])),
  state: t.Optional(globalTaskStateSchema),
});

const unauthorizedPayload = {
  error: "unauthorized",
  message: "Authentication required.",
} as const;

const patientNotFoundPayload = {
  error: "patient_not_found",
  message: "Patient not found.",
} as const;

const taskNotFoundPayload = {
  error: "task_not_found",
  message: "Task not found.",
} as const;

const taskDependencyCyclePayload = {
  error: "task_dependency_cycle",
  message: "Task dependency would create a cycle.",
} as const;

const taskDependenciesIncompletePayload = {
  error: "task_dependencies_incomplete",
  message: "Task dependencies must be completed first.",
} as const;

const formatDateOnly = (value: Date | string | null): string | null => {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    return value.slice(0, 10);
  }

  return value.toISOString().slice(0, 10);
};

const formatDateTime = (value: Date | null): string | null =>
  value?.toISOString() ?? null;

const getEffectiveTaskStatus = (task: {
  blocked_by_task_ids: string[];
  status: TaskStatus;
}): TaskStatus => {
  if (task.status === "completed" || task.status === "cancelled") {
    return task.status;
  }

  if (task.blocked_by_task_ids.length > 0) {
    return "blocked";
  }

  return task.status;
};

const normalizeOptionalText = (
  value?: string | null,
): string | null | undefined => {
  if (value === undefined) {
    return undefined;
  }

  return value?.trim() || null;
};

const mapTask = (task: {
  auto_recurrence_enabled: boolean;
  blocked_by_task_ids: string[];
  completed_at: Date | null;
  condition_id: string | null;
  created_at: Date;
  deleted_at: Date | null;
  description: string | null;
  due_date: Date | string | null;
  id: string;
  medication_id: string | null;
  medical_instruction_id: string | null;
  patient_id: string;
  recurrence_rule: string | null;
  scheduled_at: Date | null;
  status: TaskStatus;
  task_type: string;
  title: string;
  updated_at: Date;
}) => ({
  autoRecurrenceEnabled: task.auto_recurrence_enabled,
  blockedByTaskIds: task.blocked_by_task_ids,
  completedAt: formatDateTime(task.completed_at),
  conditionId: task.condition_id,
  createdAt: task.created_at.toISOString(),
  deletedAt: formatDateTime(task.deleted_at),
  description: task.description,
  dueDate: formatDateOnly(task.due_date),
  id: task.id,
  medicationId: task.medication_id,
  medicalInstructionId: task.medical_instruction_id,
  patientId: task.patient_id,
  recurrenceRule: task.recurrence_rule,
  scheduledAt: formatDateTime(task.scheduled_at),
  status: getEffectiveTaskStatus(task),
  taskType: task.task_type,
  title: task.title,
  updatedAt: task.updated_at.toISOString(),
});

const mapGlobalTask = (task: {
  auto_recurrence_enabled: boolean;
  blocked_by_task_ids: string[];
  completed_at: Date | null;
  condition_id: string | null;
  created_at: Date;
  deleted_at: Date | null;
  description: string | null;
  due_date: Date | string | null;
  id: string;
  medication_id: string | null;
  medical_instruction_id: string | null;
  patient_full_name: string;
  patient_id: string;
  recurrence_rule: string | null;
  scheduled_at: Date | null;
  status: TaskStatus;
  task_type: string;
  title: string;
  updated_at: Date;
}) => ({
  patient: {
    fullName: task.patient_full_name,
    id: task.patient_id,
  },
  task: mapTask(task),
});

const parseIncludeArchived = (value?: "true" | "false"): boolean =>
  value === "true";

const mapTaskDependency = (dependency: {
  created_at: Date;
  depends_on_task_id: string;
  id: string;
  task_id: string;
}) => ({
  createdAt: dependency.created_at.toISOString(),
  dependsOnTaskId: dependency.depends_on_task_id,
  id: dependency.id,
  taskId: dependency.task_id,
});

export const createTasksModule = (
  authInstance: typeof auth,
  service = createTasksService(),
) =>
  new Elysia({ name: "tasks-module" })
    .get(
      "/tasks",
      async ({ query, request, status }) => {
        try {
          const session = await requireRequestSession(authInstance, request);
          const tasks = await service.listAccessibleTasks(session.user.id, {
            includeArchived: parseIncludeArchived(query.includeArchived),
            ...(query.state === undefined
              ? {}
              : { state: query.state as GlobalTaskState }),
          });

          return {
            tasks: tasks.map(mapGlobalTask),
          };
        } catch {
          return status(401, unauthorizedPayload);
        }
      },
      {
        query: globalTaskListQuerySchema,
      },
    )
    .get(
      "/patients/:patientId/tasks",
      async ({ params, query, request, status }) => {
        try {
          const session = await requireRequestSession(authInstance, request);
          const tasks = await service.listTasks(
            session.user.id,
            params.patientId,
            {
              includeArchived: parseIncludeArchived(query.includeArchived),
            },
          );

          return {
            tasks: tasks.map(mapTask),
          };
        } catch (error) {
          if (error instanceof PatientTaskAccessError) {
            return status(404, patientNotFoundPayload);
          }

          return status(401, unauthorizedPayload);
        }
      },
      {
        params: patientIdParamsSchema,
        query: taskListQuerySchema,
      },
    )
    .post(
      "/patients/:patientId/tasks",
      async ({ body, params, request, status }) => {
        try {
          const session = await requireRequestSession(authInstance, request);
          const task = await service.createTask(
            session.user.id,
            params.patientId,
            {
              autoRecurrenceEnabled: body.autoRecurrenceEnabled ?? false,
              conditionId: body.conditionId ?? null,
              description: normalizeOptionalText(body.description) ?? null,
              dueDate: body.dueDate ?? null,
              medicationId: body.medicationId ?? null,
              medicalInstructionId: body.medicalInstructionId ?? null,
              recurrenceRule:
                normalizeOptionalText(body.recurrenceRule) ?? null,
              scheduledAt: body.scheduledAt ?? null,
              status: body.status ?? "pending",
              taskType: body.taskType.trim(),
              title: body.title.trim(),
            },
          );

          return {
            task: mapTask(task),
          };
        } catch (error) {
          if (error instanceof PatientTaskAccessError) {
            return status(404, patientNotFoundPayload);
          }

          return status(401, unauthorizedPayload);
        }
      },
      {
        body: taskBodySchema,
        params: patientIdParamsSchema,
      },
    )
    .get(
      "/tasks/:taskId",
      async ({ params, request, status }) => {
        try {
          const session = await requireRequestSession(authInstance, request);
          const task = await service.getTask(session.user.id, params.taskId);

          return {
            task: mapTask(task),
          };
        } catch (error) {
          if (error instanceof TaskAccessError) {
            return status(404, taskNotFoundPayload);
          }

          return status(401, unauthorizedPayload);
        }
      },
      {
        params: taskIdParamsSchema,
      },
    )
    .patch(
      "/tasks/:taskId",
      async ({ body, params, request, status }) => {
        try {
          const session = await requireRequestSession(authInstance, request);
          const task = await service.updateTask(
            session.user.id,
            params.taskId,
            {
              ...(body.autoRecurrenceEnabled === undefined
                ? {}
                : { autoRecurrenceEnabled: body.autoRecurrenceEnabled }),
              ...(body.conditionId === undefined
                ? {}
                : { conditionId: body.conditionId }),
              ...(body.description === undefined
                ? {}
                : {
                    description:
                      normalizeOptionalText(body.description) ?? null,
                  }),
              ...(body.dueDate === undefined ? {} : { dueDate: body.dueDate }),
              ...(body.medicationId === undefined
                ? {}
                : { medicationId: body.medicationId }),
              ...(body.medicalInstructionId === undefined
                ? {}
                : { medicalInstructionId: body.medicalInstructionId }),
              ...(body.recurrenceRule === undefined
                ? {}
                : {
                    recurrenceRule:
                      normalizeOptionalText(body.recurrenceRule) ?? null,
                  }),
              ...(body.scheduledAt === undefined
                ? {}
                : { scheduledAt: body.scheduledAt }),
              ...(body.taskType === undefined
                ? {}
                : { taskType: body.taskType.trim() }),
              ...(body.title === undefined ? {} : { title: body.title.trim() }),
            },
          );

          return {
            task: mapTask(task),
          };
        } catch (error) {
          if (error instanceof TaskAccessError) {
            return status(404, taskNotFoundPayload);
          }

          return status(401, unauthorizedPayload);
        }
      },
      {
        body: taskUpdateBodySchema,
        params: taskIdParamsSchema,
      },
    )
    .patch(
      "/tasks/:taskId/status",
      async ({ body, params, request, status }) => {
        try {
          const session = await requireRequestSession(authInstance, request);
          const task = await service.changeTaskStatus(
            session.user.id,
            params.taskId,
            body.status,
          );

          return {
            task: mapTask(task),
          };
        } catch (error) {
          if (error instanceof TaskIncompleteDependenciesError) {
            return status(409, taskDependenciesIncompletePayload);
          }

          if (error instanceof TaskAccessError) {
            return status(404, taskNotFoundPayload);
          }

          return status(401, unauthorizedPayload);
        }
      },
      {
        body: taskStatusBodySchema,
        params: taskIdParamsSchema,
      },
    )
    .get(
      "/tasks/:taskId/dependencies",
      async ({ params, request, status }) => {
        try {
          const session = await requireRequestSession(authInstance, request);
          const dependencies = await service.listTaskDependencies(
            session.user.id,
            params.taskId,
          );

          return {
            dependencies: dependencies.map(mapTaskDependency),
          };
        } catch (error) {
          if (error instanceof TaskAccessError) {
            return status(404, taskNotFoundPayload);
          }

          return status(401, unauthorizedPayload);
        }
      },
      {
        params: taskIdParamsSchema,
      },
    )
    .post(
      "/tasks/:taskId/dependencies",
      async ({ body, params, request, status }) => {
        try {
          const session = await requireRequestSession(authInstance, request);
          const dependency = await service.addTaskDependency(
            session.user.id,
            params.taskId,
            body.dependsOnTaskId,
          );

          return {
            dependency: mapTaskDependency(dependency),
          };
        } catch (error) {
          if (error instanceof TaskDependencyCycleError) {
            return status(409, taskDependencyCyclePayload);
          }

          if (error instanceof TaskAccessError) {
            return status(404, taskNotFoundPayload);
          }

          return status(401, unauthorizedPayload);
        }
      },
      {
        body: taskDependencyBodySchema,
        params: taskIdParamsSchema,
      },
    )
    .delete(
      "/tasks/:taskId/dependencies/:dependsOnTaskId",
      async ({ params, request, status }) => {
        try {
          const session = await requireRequestSession(authInstance, request);
          await service.removeTaskDependency(
            session.user.id,
            params.taskId,
            params.dependsOnTaskId,
          );

          return {
            removed: true,
          };
        } catch (error) {
          if (error instanceof TaskAccessError) {
            return status(404, taskNotFoundPayload);
          }

          return status(401, unauthorizedPayload);
        }
      },
      {
        params: taskDependencyParamsSchema,
      },
    )
    .delete(
      "/tasks/:taskId",
      async ({ params, request, status }) => {
        try {
          const session = await requireRequestSession(authInstance, request);
          const task = await service.archiveTask(
            session.user.id,
            params.taskId,
          );

          return {
            task: mapTask(task),
          };
        } catch (error) {
          if (error instanceof TaskAccessError) {
            return status(404, taskNotFoundPayload);
          }

          return status(401, unauthorizedPayload);
        }
      },
      {
        params: taskIdParamsSchema,
      },
    );
