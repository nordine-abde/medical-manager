import type {
  CareEventListFilters,
  CareEventListResult,
  CareEventRecord,
  CareEventSubtypesByType,
  CareEventUpsertPayload,
} from "./types";

const API_BASE_PATH = "/api/v1";

interface ApiErrorPayload {
  error?: string;
  message?: string;
}

interface CareEventPayload {
  careEvent: CareEventRecord;
}

interface CareEventsPayload {
  careEvents: CareEventRecord[];
  pagination: CareEventListResult["pagination"];
}

interface CareEventSubtypesPayload {
  subtypesByType: CareEventSubtypesByType;
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

export const listCareEventsRequest = async (
  patientId: string,
  filters: CareEventListFilters = {},
): Promise<CareEventListResult> => {
  const payload = await requestJson<CareEventsPayload>(
    `/patients/${patientId}/care-events${toQueryString(filters)}`,
    {
      method: "GET",
    },
    "Unable to load care events.",
  );

  return {
    careEvents: payload.careEvents,
    pagination: payload.pagination,
  };
};

export const listCareEventSubtypesRequest = async (
  patientId: string,
): Promise<CareEventSubtypesByType> => {
  const payload = await requestJson<CareEventSubtypesPayload>(
    `/patients/${patientId}/care-event-subtypes`,
    {
      method: "GET",
    },
    "Unable to load care event subtypes.",
  );

  return payload.subtypesByType;
};

const toQueryString = (filters: CareEventListFilters): string => {
  const searchParams = new URLSearchParams();

  if (filters.bookingId) {
    searchParams.set("bookingId", filters.bookingId);
  }

  if (filters.eventType) {
    searchParams.set("eventType", filters.eventType);
  }

  if (filters.facilityId) {
    searchParams.set("facilityId", filters.facilityId);
  }

  if (filters.from) {
    searchParams.set("from", filters.from);
  }

  if (filters.page) {
    searchParams.set("page", String(filters.page));
  }

  if (filters.pageSize) {
    searchParams.set("pageSize", String(filters.pageSize));
  }

  if (filters.search?.trim()) {
    searchParams.set("search", filters.search.trim());
  }

  if (filters.subtype?.trim()) {
    searchParams.set("subtype", filters.subtype.trim());
  }

  if (filters.taskId) {
    searchParams.set("taskId", filters.taskId);
  }

  if (filters.to) {
    searchParams.set("to", filters.to);
  }

  const queryString = searchParams.toString();

  return queryString ? `?${queryString}` : "";
};

export const createCareEventRequest = async (
  patientId: string,
  payload: CareEventUpsertPayload,
): Promise<CareEventRecord> => {
  const response = await requestJson<CareEventPayload>(
    `/patients/${patientId}/care-events`,
    {
      body: JSON.stringify(payload),
      method: "POST",
    },
    "Unable to create the care event.",
  );

  return response.careEvent;
};

export const getCareEventRequest = async (
  careEventId: string,
): Promise<CareEventRecord> => {
  const response = await requestJson<CareEventPayload>(
    `/care-events/${careEventId}`,
    {
      method: "GET",
    },
    "Unable to load the care event.",
  );

  return response.careEvent;
};

export const updateCareEventRequest = async (
  careEventId: string,
  payload: Partial<CareEventUpsertPayload>,
): Promise<CareEventRecord> => {
  const requestBody: Partial<CareEventUpsertPayload> = {};

  if (payload.bookingId !== undefined) {
    requestBody.bookingId = payload.bookingId;
  }

  if (payload.completedAt !== undefined) {
    requestBody.completedAt = payload.completedAt;
  }

  if (payload.eventType !== undefined) {
    requestBody.eventType = payload.eventType;
  }

  if (payload.facilityId !== undefined) {
    requestBody.facilityId = payload.facilityId;
  }

  if (payload.outcomeNotes !== undefined) {
    requestBody.outcomeNotes = payload.outcomeNotes;
  }

  if (payload.providerName !== undefined) {
    requestBody.providerName = payload.providerName;
  }

  if (payload.subtype !== undefined) {
    requestBody.subtype = payload.subtype;
  }

  if (payload.taskId !== undefined) {
    requestBody.taskId = payload.taskId;
  }

  const response = await requestJson<CareEventPayload>(
    `/care-events/${careEventId}`,
    {
      body: JSON.stringify(requestBody),
      method: "PATCH",
    },
    "Unable to update the care event.",
  );

  return response.careEvent;
};
