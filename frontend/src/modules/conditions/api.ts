import type {
  ConditionListFilters,
  ConditionRecord,
  ConditionUpsertPayload,
} from "./types";

const API_BASE_PATH = "/api/v1";

interface ApiErrorPayload {
  error?: string;
  message?: string;
}

interface ConditionPayload {
  condition: ConditionRecord;
}

interface ConditionsPayload {
  conditions: ConditionRecord[];
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

const toQueryString = (filters: ConditionListFilters): string => {
  const searchParams = new URLSearchParams();

  if (filters.includeInactive) {
    searchParams.set("includeInactive", "true");
  }

  const queryString = searchParams.toString();

  return queryString ? `?${queryString}` : "";
};

export const listConditionsRequest = async (
  patientId: string,
  filters: ConditionListFilters = {},
): Promise<ConditionRecord[]> => {
  const payload = await requestJson<ConditionsPayload>(
    `/patients/${patientId}/conditions${toQueryString(filters)}`,
    {
      method: "GET",
    },
    "Unable to load conditions.",
  );

  return payload.conditions;
};

export const createConditionRequest = async (
  patientId: string,
  payload: ConditionUpsertPayload,
): Promise<ConditionRecord> => {
  const response = await requestJson<ConditionPayload>(
    `/patients/${patientId}/conditions`,
    {
      body: JSON.stringify(payload),
      method: "POST",
    },
    "Unable to create the condition.",
  );

  return response.condition;
};

export const updateConditionRequest = async (
  conditionId: string,
  payload: Partial<ConditionUpsertPayload>,
): Promise<ConditionRecord> => {
  const response = await requestJson<ConditionPayload>(
    `/conditions/${conditionId}`,
    {
      body: JSON.stringify(payload),
      method: "PATCH",
    },
    "Unable to update the condition.",
  );

  return response.condition;
};

export const deactivateConditionRequest = async (
  conditionId: string,
): Promise<ConditionRecord> => {
  const response = await requestJson<ConditionPayload>(
    `/conditions/${conditionId}`,
    {
      method: "DELETE",
    },
    "Unable to deactivate the condition.",
  );

  return response.condition;
};
