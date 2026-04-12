import type { Sql } from "postgres";

import { databaseSchemaName, qualifyTableName } from "../../db/schema";

export const taskStatuses = [
  "pending",
  "blocked",
  "scheduled",
  "completed",
  "cancelled",
  "deferred",
] as const;

export type TaskStatus = (typeof taskStatuses)[number];

type TaskListFilters = {
  includeArchived: boolean;
};

export const globalTaskStates = [
  "pending",
  "blocked",
  "overdue",
  "upcoming",
  "completed",
] as const;

export type GlobalTaskState = (typeof globalTaskStates)[number];

export type TaskRecord = {
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
};

export type GlobalTaskRecord = TaskRecord & {
  patient_full_name: string;
};

export type CreateTaskInput = {
  autoRecurrenceEnabled: boolean;
  conditionId: string | null;
  description: string | null;
  dueDate: string | null;
  medicationId: string | null;
  medicalInstructionId: string | null;
  recurrenceRule: string | null;
  scheduledAt: string | null;
  status: TaskStatus;
  taskType: string;
  title: string;
};

export type UpdateTaskInput = Partial<Omit<CreateTaskInput, "status">>;

export type TaskDependencyRecord = {
  created_at: Date;
  depends_on_task_id: string;
  id: string;
  task_id: string;
};

const patientsTable = (schemaName: string): string =>
  qualifyTableName(schemaName, "patients");

const patientUsersTable = (schemaName: string): string =>
  qualifyTableName(schemaName, "patient_users");

const conditionsTable = (schemaName: string): string =>
  qualifyTableName(schemaName, "conditions");

const medicalInstructionsTable = (schemaName: string): string =>
  qualifyTableName(schemaName, "medical_instructions");

const tasksTable = (schemaName: string): string =>
  qualifyTableName(schemaName, "tasks");

const taskDependenciesTable = (schemaName: string): string =>
  qualifyTableName(schemaName, "task_dependencies");

const medicationsTable = (schemaName: string): string =>
  qualifyTableName(schemaName, "medications");

export const createTasksRepository = (
  sql: Sql,
  schemaName = databaseSchemaName,
) => {
  const qualifiedPatientsTable = patientsTable(schemaName);
  const qualifiedPatientUsersTable = patientUsersTable(schemaName);
  const qualifiedConditionsTable = conditionsTable(schemaName);
  const qualifiedMedicalInstructionsTable =
    medicalInstructionsTable(schemaName);
  const qualifiedTasksTable = tasksTable(schemaName);
  const qualifiedTaskDependenciesTable = taskDependenciesTable(schemaName);
  const qualifiedMedicationsTable = medicationsTable(schemaName);
  const taskColumns = `
    t.id,
    t.patient_id,
    t.medical_instruction_id,
    t.medication_id,
    t.condition_id,
    t.title,
    t.description,
    t.task_type,
    t.status,
    t.due_date,
    t.scheduled_at,
    t.auto_recurrence_enabled,
    t.recurrence_rule,
    t.completed_at,
    t.deleted_at,
    t.created_at,
    t.updated_at,
    coalesce(
      (
        select array_agg(td.depends_on_task_id order by td.depends_on_task_id)
        from ${qualifiedTaskDependenciesTable} as td
        inner join ${qualifiedTasksTable} as prerequisite
          on prerequisite.id = td.depends_on_task_id
        where td.task_id = t.id
          and prerequisite.status <> 'completed'
      ),
      '{}'::uuid[]
    ) as blocked_by_task_ids
  `;

  return {
    async addDependencyAccessible(
      userId: string,
      taskId: string,
      dependsOnTaskId: string,
    ): Promise<TaskDependencyRecord | null> {
      const task = await this.findAccessibleById(userId, taskId);
      const dependsOnTask = await this.findAccessibleById(
        userId,
        dependsOnTaskId,
      );

      if (
        !task ||
        !dependsOnTask ||
        task.patient_id !== dependsOnTask.patient_id
      ) {
        return null;
      }

      if (await this.wouldCreateDependencyCycle(taskId, dependsOnTaskId)) {
        throw new Error("TASK_DEPENDENCY_CYCLE");
      }

      const [dependency] = await sql.unsafe<[TaskDependencyRecord]>(
        `
          insert into ${qualifiedTaskDependenciesTable} (
            task_id,
            depends_on_task_id
          )
          values ($1, $2)
          on conflict (task_id, depends_on_task_id) do update
            set depends_on_task_id = excluded.depends_on_task_id
          returning
            id,
            task_id,
            depends_on_task_id,
            created_at
        `,
        [taskId, dependsOnTaskId],
      );

      return dependency ?? null;
    },

    async create(
      userId: string,
      patientId: string,
      input: CreateTaskInput,
    ): Promise<TaskRecord | null> {
      const hasAccess = await this.hasPatientAccess(userId, patientId);

      if (!hasAccess) {
        return null;
      }

      const linksAreValid = await this.hasValidOptionalLinks(
        patientId,
        input.conditionId,
        input.medicalInstructionId,
        input.medicationId,
      );

      if (!linksAreValid) {
        return null;
      }

      const linkedMedication = await this.findMedicationForTask(
        patientId,
        input.medicationId,
      );
      const dueDate =
        input.taskType === "medication_renewal" && input.dueDate === null
          ? (linkedMedication?.next_gp_contact_date ?? null)
          : input.dueDate;

      const [createdTask] = await sql.unsafe<Array<{ id: string }>>(
        `
          insert into ${qualifiedTasksTable} (
            patient_id,
            medical_instruction_id,
            medication_id,
            condition_id,
            title,
            description,
            task_type,
            status,
            due_date,
            scheduled_at,
            auto_recurrence_enabled,
            recurrence_rule,
            completed_at
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          returning id
        `,
        [
          patientId,
          input.medicalInstructionId,
          input.medicationId,
          input.conditionId,
          input.title,
          input.description,
          input.taskType,
          input.status,
          dueDate,
          input.scheduledAt,
          input.autoRecurrenceEnabled,
          input.recurrenceRule,
          input.status === "completed" ? new Date().toISOString() : null,
        ],
      );

      if (!createdTask) {
        return null;
      }

      return this.findAccessibleById(userId, createdTask.id);
    },

    async findAccessibleById(
      userId: string,
      taskId: string,
    ): Promise<TaskRecord | null> {
      const [task] = await sql.unsafe<[TaskRecord]>(
        `
          select
            ${taskColumns}
          from ${qualifiedTasksTable} as t
          inner join ${qualifiedPatientUsersTable} as pu
            on pu.patient_id = t.patient_id
          where pu.user_id = $1
            and t.id = $2
          limit 1
        `,
        [userId, taskId],
      );

      return task ?? null;
    },

    async hasPatientAccess(
      userId: string,
      patientId: string,
    ): Promise<boolean> {
      const [result] = await sql.unsafe<Array<{ id: string }>>(
        `
          select p.id
          from ${qualifiedPatientsTable} as p
          inner join ${qualifiedPatientUsersTable} as pu
            on pu.patient_id = p.id
          where pu.user_id = $1
            and p.id = $2
          limit 1
        `,
        [userId, patientId],
      );

      return result !== undefined;
    },

    async hasIncompleteDependencies(taskId: string): Promise<boolean> {
      const [result] = await sql.unsafe<Array<{ blocked: boolean }>>(
        `
          select exists (
            select 1
            from ${qualifiedTaskDependenciesTable} as td
            inner join ${qualifiedTasksTable} as prerequisite
              on prerequisite.id = td.depends_on_task_id
            where td.task_id = $1
              and prerequisite.status <> 'completed'
          ) as blocked
        `,
        [taskId],
      );

      return result?.blocked ?? false;
    },

    async hasValidOptionalLinks(
      patientId: string,
      conditionId: string | null,
      medicalInstructionId: string | null,
      medicationId: string | null,
    ): Promise<boolean> {
      if (conditionId) {
        const [condition] = await sql.unsafe<Array<{ id: string }>>(
          `
            select c.id
            from ${qualifiedConditionsTable} as c
            where c.id = $1
              and c.patient_id = $2
            limit 1
          `,
          [conditionId, patientId],
        );

        if (!condition) {
          return false;
        }
      }

      if (medicalInstructionId) {
        const [instruction] = await sql.unsafe<Array<{ id: string }>>(
          `
            select mi.id
            from ${qualifiedMedicalInstructionsTable} as mi
            where mi.id = $1
              and mi.patient_id = $2
            limit 1
          `,
          [medicalInstructionId, patientId],
        );

        if (!instruction) {
          return false;
        }
      }

      if (medicationId) {
        const [medication] = await sql.unsafe<Array<{ id: string }>>(
          `
            select m.id
            from ${qualifiedMedicationsTable} as m
            where m.id = $1
              and m.patient_id = $2
            limit 1
          `,
          [medicationId, patientId],
        );

        if (!medication) {
          return false;
        }
      }

      return true;
    },

    async findMedicationForTask(
      patientId: string,
      medicationId: string | null,
    ): Promise<{ next_gp_contact_date: Date | string | null } | null> {
      if (!medicationId) {
        return null;
      }

      const [medication] = await sql.unsafe<
        Array<{ next_gp_contact_date: Date | string | null }>
      >(
        `
          select m.next_gp_contact_date
          from ${qualifiedMedicationsTable} as m
          where m.id = $1
            and m.patient_id = $2
          limit 1
        `,
        [medicationId, patientId],
      );

      return medication ?? null;
    },

    async listAccessible(
      userId: string,
      filters: TaskListFilters & {
        state?: GlobalTaskState;
      },
    ): Promise<GlobalTaskRecord[]> {
      return sql.unsafe<GlobalTaskRecord[]>(
        `
          select
            ${taskColumns},
            p.full_name as patient_full_name
          from ${qualifiedTasksTable} as t
          inner join ${qualifiedPatientsTable} as p
            on p.id = t.patient_id
          inner join ${qualifiedPatientUsersTable} as pu
            on pu.patient_id = t.patient_id
          where pu.user_id = $1
            and ($2 or t.deleted_at is null)
            and (
              $3::text is null
              or (
                $3 = 'blocked'
                and t.status not in ('completed', 'cancelled')
                and exists (
                  select 1
                  from ${qualifiedTaskDependenciesTable} as td
                  inner join ${qualifiedTasksTable} as prerequisite
                    on prerequisite.id = td.depends_on_task_id
                  where td.task_id = t.id
                    and prerequisite.status <> 'completed'
                )
              )
              or (
                $3 = 'completed'
                and t.status = 'completed'
              )
              or (
                $3 = 'overdue'
                and t.status not in ('blocked', 'completed', 'cancelled')
                and t.due_date is not null
                and t.due_date < current_date
                and not exists (
                  select 1
                  from ${qualifiedTaskDependenciesTable} as td
                  inner join ${qualifiedTasksTable} as prerequisite
                    on prerequisite.id = td.depends_on_task_id
                  where td.task_id = t.id
                    and prerequisite.status <> 'completed'
                )
              )
              or (
                $3 = 'pending'
                and t.status = 'pending'
                and not exists (
                  select 1
                  from ${qualifiedTaskDependenciesTable} as td
                  inner join ${qualifiedTasksTable} as prerequisite
                    on prerequisite.id = td.depends_on_task_id
                  where td.task_id = t.id
                    and prerequisite.status <> 'completed'
                )
                and (
                  t.due_date is null
                  or t.due_date >= current_date
                )
              )
              or (
                $3 = 'upcoming'
                and t.status not in ('blocked', 'completed', 'cancelled')
                and not exists (
                  select 1
                  from ${qualifiedTaskDependenciesTable} as td
                  inner join ${qualifiedTasksTable} as prerequisite
                    on prerequisite.id = td.depends_on_task_id
                  where td.task_id = t.id
                    and prerequisite.status <> 'completed'
                )
                and (
                  t.due_date is null
                  or t.due_date >= current_date
                )
              )
            )
          order by
            case
              when t.status = 'completed' then 2
              when t.due_date is not null and t.due_date < current_date then 0
              else 1
            end asc,
            t.due_date asc nulls last,
            t.scheduled_at asc nulls last,
            lower(p.full_name) asc,
            lower(t.title) asc,
            t.created_at asc
        `,
        [userId, filters.includeArchived, filters.state ?? null],
      );
    },

    async listByPatient(
      userId: string,
      patientId: string,
      filters: TaskListFilters,
    ): Promise<TaskRecord[] | null> {
      const hasAccess = await this.hasPatientAccess(userId, patientId);

      if (!hasAccess) {
        return null;
      }

      return sql.unsafe<TaskRecord[]>(
        `
          select
            ${taskColumns}
          from ${qualifiedTasksTable} as t
          where t.patient_id = $1
            and ($2 or t.deleted_at is null)
          order by
            t.deleted_at asc nulls first,
            t.completed_at asc nulls first,
            t.due_date asc nulls last,
            t.scheduled_at asc nulls last,
            lower(t.title) asc,
            t.created_at asc
        `,
        [patientId, filters.includeArchived],
      );
    },

    async listDependenciesAccessible(
      userId: string,
      taskId: string,
    ): Promise<TaskDependencyRecord[] | null> {
      const task = await this.findAccessibleById(userId, taskId);

      if (!task) {
        return null;
      }

      return sql.unsafe<TaskDependencyRecord[]>(
        `
          select
            td.id,
            td.task_id,
            td.depends_on_task_id,
            td.created_at
          from ${qualifiedTaskDependenciesTable} as td
          inner join ${qualifiedTasksTable} as prerequisite
            on prerequisite.id = td.depends_on_task_id
          where td.task_id = $1
          order by prerequisite.created_at asc, td.created_at asc
        `,
        [taskId],
      );
    },

    async removeDependencyAccessible(
      userId: string,
      taskId: string,
      dependsOnTaskId: string,
    ): Promise<boolean | null> {
      const task = await this.findAccessibleById(userId, taskId);
      const dependsOnTask = await this.findAccessibleById(
        userId,
        dependsOnTaskId,
      );

      if (
        !task ||
        !dependsOnTask ||
        task.patient_id !== dependsOnTask.patient_id
      ) {
        return null;
      }

      const result = await sql.unsafe(
        `
          delete from ${qualifiedTaskDependenciesTable}
          where task_id = $1
            and depends_on_task_id = $2
        `,
        [taskId, dependsOnTaskId],
      );

      return result.count > 0;
    },

    async setArchivedState(
      userId: string,
      taskId: string,
      archived: boolean,
    ): Promise<TaskRecord | null> {
      const existingTask = await this.findAccessibleById(userId, taskId);

      if (!existingTask) {
        return null;
      }

      const [archivedTask] = await sql.unsafe<Array<{ id: string }>>(
        `
          update ${qualifiedTasksTable}
          set
            deleted_at = ${archived ? "now()" : "null"},
            updated_at = now()
          where id = $1
          returning id
        `,
        [taskId],
      );

      if (!archivedTask) {
        return null;
      }

      return this.findAccessibleById(userId, archivedTask.id);
    },

    async updateAccessible(
      userId: string,
      taskId: string,
      input: UpdateTaskInput,
    ): Promise<TaskRecord | null> {
      const existingTask = await this.findAccessibleById(userId, taskId);

      if (!existingTask) {
        return null;
      }

      const conditionId =
        input.conditionId === undefined
          ? existingTask.condition_id
          : input.conditionId;
      const medicationId =
        input.medicationId === undefined
          ? existingTask.medication_id
          : input.medicationId;
      const medicalInstructionId =
        input.medicalInstructionId === undefined
          ? existingTask.medical_instruction_id
          : input.medicalInstructionId;

      const linksAreValid = await this.hasValidOptionalLinks(
        existingTask.patient_id,
        conditionId,
        medicalInstructionId,
        medicationId,
      );

      if (!linksAreValid) {
        return null;
      }

      const taskType = input.taskType ?? existingTask.task_type;
      const linkedMedication = await this.findMedicationForTask(
        existingTask.patient_id,
        medicationId,
      );
      const dueDate =
        input.dueDate !== undefined
          ? input.dueDate
          : taskType === "medication_renewal" && existingTask.due_date === null
            ? (linkedMedication?.next_gp_contact_date ?? null)
            : existingTask.due_date;

      const [updatedTask] = await sql.unsafe<Array<{ id: string }>>(
        `
          update ${qualifiedTasksTable}
          set
            medical_instruction_id = $1,
            medication_id = $2,
            condition_id = $3,
            title = $4,
            description = $5,
            task_type = $6,
            due_date = $7,
            scheduled_at = $8,
            auto_recurrence_enabled = $9,
            recurrence_rule = $10,
            updated_at = now()
          where id = $11
          returning id
        `,
        [
          medicalInstructionId,
          medicationId,
          conditionId,
          input.title ?? existingTask.title,
          input.description === undefined
            ? existingTask.description
            : input.description,
          taskType,
          dueDate,
          input.scheduledAt === undefined
            ? existingTask.scheduled_at
            : input.scheduledAt,
          input.autoRecurrenceEnabled ?? existingTask.auto_recurrence_enabled,
          input.recurrenceRule === undefined
            ? existingTask.recurrence_rule
            : input.recurrenceRule,
          taskId,
        ],
      );

      if (!updatedTask) {
        return null;
      }

      return this.findAccessibleById(userId, updatedTask.id);
    },

    async updateStatusAccessible(
      userId: string,
      taskId: string,
      status: TaskStatus,
    ): Promise<TaskRecord | null> {
      const existingTask = await this.findAccessibleById(userId, taskId);

      if (!existingTask) {
        return null;
      }

      if (
        status === "completed" &&
        (await this.hasIncompleteDependencies(taskId))
      ) {
        throw new Error("TASK_DEPENDENCIES_INCOMPLETE");
      }

      const completedAt =
        status === "completed" ? new Date().toISOString() : null;

      const [updatedTask] = await sql.unsafe<Array<{ id: string }>>(
        `
          update ${qualifiedTasksTable}
          set
            status = $1,
            completed_at = $2,
            updated_at = now()
          where id = $3
          returning id
        `,
        [status, completedAt, taskId],
      );

      if (!updatedTask) {
        return null;
      }

      return this.findAccessibleById(userId, updatedTask.id);
    },

    async wouldCreateDependencyCycle(
      taskId: string,
      dependsOnTaskId: string,
    ): Promise<boolean> {
      if (taskId === dependsOnTaskId) {
        return true;
      }

      const [result] = await sql.unsafe<Array<{ has_cycle: boolean }>>(
        `
          with recursive dependency_path as (
            select td.depends_on_task_id
            from ${qualifiedTaskDependenciesTable} as td
            where td.task_id = $1
            union
            select td.depends_on_task_id
            from ${qualifiedTaskDependenciesTable} as td
            inner join dependency_path as path
              on td.task_id = path.depends_on_task_id
          )
          select exists (
            select 1
            from dependency_path
            where depends_on_task_id = $2
          ) as has_cycle
        `,
        [dependsOnTaskId, taskId],
      );

      return result?.has_cycle ?? false;
    },
  };
};

export type TasksRepository = ReturnType<typeof createTasksRepository>;
