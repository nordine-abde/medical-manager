import { createSqlClient } from "../../db/client";
import { databaseSchemaName } from "../../db/schema";
import {
  type CreateTaskInput,
  createTasksRepository,
  type GlobalTaskRecord,
  type GlobalTaskState,
  type TaskDependencyRecord,
  type TaskRecord,
  type TaskStatus,
  type TasksRepository,
  type UpdateTaskInput,
} from "./repository";

type TaskListFilters = {
  includeArchived: boolean;
};

type GlobalTaskListFilters = TaskListFilters & {
  state?: GlobalTaskState;
};

export class PatientTaskAccessError extends Error {
  constructor() {
    super("PATIENT_NOT_FOUND");
  }
}

export class TaskAccessError extends Error {
  constructor() {
    super("TASK_NOT_FOUND");
  }
}

export class TaskDependencyCycleError extends Error {
  constructor() {
    super("TASK_DEPENDENCY_CYCLE");
  }
}

export class TaskIncompleteDependenciesError extends Error {
  constructor() {
    super("TASK_DEPENDENCIES_INCOMPLETE");
  }
}

const defaultTasksRepository = createTasksRepository(
  createSqlClient(),
  databaseSchemaName,
);

export const createTasksService = (
  repository: TasksRepository = defaultTasksRepository,
) => ({
  async listAccessibleTasks(
    userId: string,
    filters: GlobalTaskListFilters,
  ): Promise<GlobalTaskRecord[]> {
    return repository.listAccessible(userId, filters);
  },

  async listTasks(
    userId: string,
    patientId: string,
    filters: TaskListFilters,
  ): Promise<TaskRecord[]> {
    const tasks = await repository.listByPatient(userId, patientId, filters);

    if (!tasks) {
      throw new PatientTaskAccessError();
    }

    return tasks;
  },

  async createTask(
    userId: string,
    patientId: string,
    input: CreateTaskInput,
  ): Promise<TaskRecord> {
    const task = await repository.create(userId, patientId, input);

    if (!task) {
      throw new PatientTaskAccessError();
    }

    return task;
  },

  async getTask(userId: string, taskId: string): Promise<TaskRecord> {
    const task = await repository.findAccessibleById(userId, taskId);

    if (!task) {
      throw new TaskAccessError();
    }

    return task;
  },

  async updateTask(
    userId: string,
    taskId: string,
    input: UpdateTaskInput,
  ): Promise<TaskRecord> {
    const task = await repository.updateAccessible(userId, taskId, input);

    if (!task) {
      throw new TaskAccessError();
    }

    return task;
  },

  async archiveTask(userId: string, taskId: string): Promise<TaskRecord> {
    const task = await repository.setArchivedState(userId, taskId, true);

    if (!task) {
      throw new TaskAccessError();
    }

    return task;
  },

  async changeTaskStatus(
    userId: string,
    taskId: string,
    status: TaskStatus,
  ): Promise<TaskRecord> {
    let task: TaskRecord | null;

    try {
      task = await repository.updateStatusAccessible(userId, taskId, status);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "TASK_DEPENDENCIES_INCOMPLETE"
      ) {
        throw new TaskIncompleteDependenciesError();
      }

      throw error;
    }

    if (!task) {
      throw new TaskAccessError();
    }

    return task;
  },

  async addTaskDependency(
    userId: string,
    taskId: string,
    dependsOnTaskId: string,
  ): Promise<TaskDependencyRecord> {
    let dependency: TaskDependencyRecord | null;

    try {
      dependency = await repository.addDependencyAccessible(
        userId,
        taskId,
        dependsOnTaskId,
      );
    } catch (error) {
      if (error instanceof Error && error.message === "TASK_DEPENDENCY_CYCLE") {
        throw new TaskDependencyCycleError();
      }

      throw error;
    }

    if (!dependency) {
      throw new TaskAccessError();
    }

    return dependency;
  },

  async listTaskDependencies(
    userId: string,
    taskId: string,
  ): Promise<TaskDependencyRecord[]> {
    const dependencies = await repository.listDependenciesAccessible(
      userId,
      taskId,
    );

    if (!dependencies) {
      throw new TaskAccessError();
    }

    return dependencies;
  },

  async removeTaskDependency(
    userId: string,
    taskId: string,
    dependsOnTaskId: string,
  ): Promise<void> {
    const removed = await repository.removeDependencyAccessible(
      userId,
      taskId,
      dependsOnTaskId,
    );

    if (removed === null) {
      throw new TaskAccessError();
    }
  },
});

export type TasksService = ReturnType<typeof createTasksService>;
