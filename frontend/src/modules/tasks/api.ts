import type {
  GlobalTaskListFilters,
  GlobalTaskRecord,
  TaskListFilters,
  TaskRecord,
  TaskUpsertPayload,
  TaskWorkflowStatus,
} from "./types";

const API_BASE_PATH = "/api/v1";

interface ApiErrorPayload {
  error?: string;
  message?: string;
}

interface TaskPayload {
  task: TaskRecord;
}

interface TasksPayload {
  tasks: TaskRecord[];
}

interface GlobalTasksPayload {
  tasks: GlobalTaskRecord[];
}

const buildRequestHeaders = (body?: BodyInit | null): HeadersInit => {
  if (body === undefined || body === null) {
    return {};
  }

  return {
    "content-type": "application/json",
  };
};

const readErrorMessage = async (
  response: Response,
  fallbackMessage: string,
): Promise<string> => {
  let payload: ApiErrorPayload | null = null;

  try {
    payload = (await response.json()) as ApiErrorPayload;
  } catch {
    return fallbackMessage;
  }

  return payload.message ?? fallbackMessage;
};

const requestJson = async <T>(
  path: string,
  init: RequestInit,
  fallbackMessage: string,
): Promise<T> => {
  const response = await fetch(`${API_BASE_PATH}${path}`, {
    credentials: "include",
    ...init,
    headers: {
      ...buildRequestHeaders(init.body),
      ...init.headers,
    },
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, fallbackMessage));
  }

  return (await response.json()) as T;
};

const toQueryString = (filters: TaskListFilters): string => {
  const searchParams = new URLSearchParams();

  if (filters.includeArchived) {
    searchParams.set("includeArchived", "true");
  }

  const queryString = searchParams.toString();

  return queryString ? `?${queryString}` : "";
};

const toGlobalQueryString = (filters: GlobalTaskListFilters): string => {
  const searchParams = new URLSearchParams();

  if (filters.includeArchived) {
    searchParams.set("includeArchived", "true");
  }

  if (filters.state) {
    searchParams.set("state", filters.state);
  }

  const queryString = searchParams.toString();

  return queryString ? `?${queryString}` : "";
};

export const listGlobalTasksRequest = async (
  filters: GlobalTaskListFilters = {},
): Promise<GlobalTaskRecord[]> => {
  const payload = await requestJson<GlobalTasksPayload>(
    `/tasks${toGlobalQueryString(filters)}`,
    {
      method: "GET",
    },
    "Unable to load the global task workspace.",
  );

  return payload.tasks;
};

export const listTasksRequest = async (
  patientId: string,
  filters: TaskListFilters = {},
): Promise<TaskRecord[]> => {
  const payload = await requestJson<TasksPayload>(
    `/patients/${patientId}/tasks${toQueryString(filters)}`,
    {
      method: "GET",
    },
    "Unable to load tasks.",
  );

  return payload.tasks;
};

export const createTaskRequest = async (
  patientId: string,
  payload: TaskUpsertPayload,
): Promise<TaskRecord> => {
  const response = await requestJson<TaskPayload>(
    `/patients/${patientId}/tasks`,
    {
      body: JSON.stringify(payload),
      method: "POST",
    },
    "Unable to create the task.",
  );

  return response.task;
};

export const updateTaskRequest = async (
  taskId: string,
  payload: Partial<TaskUpsertPayload>,
): Promise<TaskRecord> => {
  const response = await requestJson<TaskPayload>(
    `/tasks/${taskId}`,
    {
      body: JSON.stringify(payload),
      method: "PATCH",
    },
    "Unable to update the task.",
  );

  return response.task;
};

export const updateTaskStatusRequest = async (
  taskId: string,
  status: TaskWorkflowStatus,
): Promise<TaskRecord> => {
  const response = await requestJson<TaskPayload>(
    `/tasks/${taskId}/status`,
    {
      body: JSON.stringify({ status }),
      method: "PATCH",
    },
    "Unable to update the task status.",
  );

  return response.task;
};

export const archiveTaskRequest = async (
  taskId: string,
): Promise<TaskRecord> => {
  const response = await requestJson<TaskPayload>(
    `/tasks/${taskId}`,
    {
      method: "DELETE",
    },
    "Unable to archive the task.",
  );

  return response.task;
};
