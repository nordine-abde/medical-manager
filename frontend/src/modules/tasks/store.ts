import { defineStore } from "pinia";

import {
  archiveTaskRequest,
  createTaskRequest,
  listGlobalTasksRequest,
  listTasksRequest,
  updateTaskRequest,
  updateTaskStatusRequest,
} from "./api";
import type {
  GlobalTaskListFilters,
  GlobalTaskRecord,
  TaskListFilters,
  TaskRecord,
  TaskUpsertPayload,
  TaskWorkflowStatus,
} from "./types";

interface UpdateTaskOptions {
  status?: TaskWorkflowStatus;
}

interface TasksState {
  globalStatus: "idle" | "loading" | "ready";
  globalTasks: GlobalTaskRecord[];
  status: "idle" | "loading" | "ready";
  tasks: TaskRecord[];
}

const sortTasks = (tasks: TaskRecord[]): TaskRecord[] =>
  [...tasks].sort((left, right) => {
    const leftCompleted = left.status === "completed";
    const rightCompleted = right.status === "completed";

    if (leftCompleted !== rightCompleted) {
      return leftCompleted ? 1 : -1;
    }

    const leftDate =
      left.dueDate ?? left.scheduledAt ?? left.updatedAt ?? left.createdAt;
    const rightDate =
      right.dueDate ?? right.scheduledAt ?? right.updatedAt ?? right.createdAt;
    const dateOrder = leftDate.localeCompare(rightDate);

    if (dateOrder !== 0) {
      return dateOrder;
    }

    return left.title.localeCompare(right.title);
  });

const upsertTask = (tasks: TaskRecord[], task: TaskRecord): TaskRecord[] => {
  const existingIndex = tasks.findIndex((item) => item.id === task.id);

  if (existingIndex === -1) {
    return sortTasks([...tasks, task]);
  }

  return sortTasks(tasks.map((item) => (item.id === task.id ? task : item)));
};

const sortGlobalTasks = (tasks: GlobalTaskRecord[]): GlobalTaskRecord[] =>
  [...tasks].sort((left, right) => {
    const leftCompleted = left.task.status === "completed";
    const rightCompleted = right.task.status === "completed";

    if (leftCompleted !== rightCompleted) {
      return leftCompleted ? 1 : -1;
    }

    const leftDate =
      left.task.dueDate ??
      left.task.scheduledAt ??
      left.task.updatedAt ??
      left.task.createdAt;
    const rightDate =
      right.task.dueDate ??
      right.task.scheduledAt ??
      right.task.updatedAt ??
      right.task.createdAt;
    const dateOrder = leftDate.localeCompare(rightDate);

    if (dateOrder !== 0) {
      return dateOrder;
    }

    const patientOrder = left.patient.fullName.localeCompare(
      right.patient.fullName,
    );

    if (patientOrder !== 0) {
      return patientOrder;
    }

    return left.task.title.localeCompare(right.task.title);
  });

let lastPatientId = "";
let lastListFilters: TaskListFilters = {};
let lastGlobalListFilters: GlobalTaskListFilters = {};

export const useTasksStore = defineStore("tasks", {
  state: (): TasksState => ({
    globalStatus: "idle",
    globalTasks: [],
    status: "idle",
    tasks: [],
  }),
  getters: {
    activeTasks: (state) =>
      state.tasks.filter((task) => task.deletedAt === null),
  },
  actions: {
    async loadGlobalTasks(filters: GlobalTaskListFilters = {}) {
      this.globalStatus = "loading";
      lastGlobalListFilters = {
        includeArchived: filters.includeArchived ?? false,
        ...(filters.state ? { state: filters.state } : {}),
      };

      try {
        this.globalTasks = sortGlobalTasks(
          await listGlobalTasksRequest(lastGlobalListFilters),
        );
        this.globalStatus = "ready";
      } catch (error) {
        this.globalStatus = "ready";
        throw error;
      }
    },
    async loadTasks(patientId: string, filters: TaskListFilters = {}) {
      this.status = "loading";
      lastPatientId = patientId;
      lastListFilters = {
        includeArchived: filters.includeArchived ?? false,
      };

      try {
        this.tasks = sortTasks(
          await listTasksRequest(patientId, lastListFilters),
        );
        this.status = "ready";
      } catch (error) {
        this.status = "ready";
        throw error;
      }
    },
    async refreshTasks() {
      if (!lastPatientId) {
        return;
      }

      await this.loadTasks(lastPatientId, lastListFilters);
    },
    async refreshGlobalTasks() {
      await this.loadGlobalTasks(lastGlobalListFilters);
    },
    async createTask(
      patientId: string,
      payload: TaskUpsertPayload,
    ): Promise<TaskRecord> {
      const task = await createTaskRequest(patientId, payload);

      if (lastListFilters.includeArchived || task.deletedAt === null) {
        this.tasks = upsertTask(this.tasks, task);
      }

      return task;
    },
    async updateTask(
      taskId: string,
      payload: Partial<TaskUpsertPayload>,
      options: UpdateTaskOptions = {},
    ): Promise<TaskRecord> {
      let task: TaskRecord | null = null;

      if (Object.keys(payload).length > 0) {
        task = await updateTaskRequest(taskId, payload);
      }

      const currentStatus =
        task?.status ?? this.tasks.find((item) => item.id === taskId)?.status;

      if (options.status && options.status !== currentStatus) {
        task = await updateTaskStatusRequest(taskId, options.status);
      }

      if (!task) {
        throw new Error("No task changes were submitted.");
      }

      if (lastListFilters.includeArchived || task.deletedAt === null) {
        this.tasks = upsertTask(this.tasks, task);
      } else {
        this.tasks = this.tasks.filter((item) => item.id !== taskId);
      }

      return task;
    },
    async changeTaskStatus(
      taskId: string,
      status: TaskWorkflowStatus,
    ): Promise<TaskRecord> {
      const task = await updateTaskStatusRequest(taskId, status);
      this.tasks = upsertTask(this.tasks, task);
      return task;
    },
    async archiveTask(taskId: string): Promise<TaskRecord> {
      const task = await archiveTaskRequest(taskId);

      if (lastListFilters.includeArchived) {
        this.tasks = upsertTask(this.tasks, task);
      } else {
        this.tasks = this.tasks.filter((item) => item.id !== taskId);
      }

      return task;
    },
  },
});
