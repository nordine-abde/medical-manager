import type { CareEventRecord, CareEventUpsertPayload } from "./types";

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
): Promise<CareEventRecord[]> => {
  const payload = await requestJson<CareEventsPayload>(
    `/patients/${patientId}/care-events`,
    {
      method: "GET",
    },
    "Unable to load care events.",
  );

  return payload.careEvents;
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
