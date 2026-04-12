import type {
  NotificationSettingsRecord,
  UpdateNotificationSettingsPayload,
} from "./types";

const API_BASE_PATH = "/api/v1";

export interface NotificationLogRecord {
  bookingId: string | null;
  channel: "telegram";
  createdAt: string;
  destination: string;
  errorMessage: string | null;
  externalMessageId: string | null;
  id: string;
  messageBody: string;
  patientId: string | null;
  sentAt: string | null;
  status: "pending" | "sent" | "failed";
  taskId: string | null;
}

interface ApiErrorPayload {
  error?: string;
  message?: string;
}

interface NotificationSettingsPayload {
  settings: NotificationSettingsRecord;
}

interface NotificationLogsPayload {
  notifications: NotificationLogRecord[];
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

export const getNotificationSettingsRequest = async (
  patientId: string,
): Promise<NotificationSettingsRecord> => {
  const payload = await requestJson<NotificationSettingsPayload>(
    `/patients/${patientId}/notifications/settings`,
    {
      method: "GET",
    },
    "Unable to load notification settings.",
  );

  return payload.settings;
};

export const updateNotificationSettingsRequest = async (
  patientId: string,
  payload: UpdateNotificationSettingsPayload,
): Promise<NotificationSettingsRecord> => {
  const response = await requestJson<NotificationSettingsPayload>(
    `/patients/${patientId}/notifications/settings`,
    {
      body: JSON.stringify(payload),
      method: "PUT",
    },
    "Unable to save notification settings.",
  );

  return response.settings;
};

export const processNotificationDeliveriesRequest = async (): Promise<
  NotificationLogRecord[]
> => {
  const response = await requestJson<NotificationLogsPayload>(
    "/notifications/deliveries/process",
    {
      method: "POST",
    },
    "Unable to process notification deliveries.",
  );

  return response.notifications;
};
