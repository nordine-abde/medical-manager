import type {
  PrescriptionListFilters,
  PrescriptionRecord,
  PrescriptionStatusPayload,
  PrescriptionUpsertPayload,
} from "./types";

const API_BASE_PATH = "/api/v1";

interface ApiErrorPayload {
  error?: string;
  message?: string;
}

interface PrescriptionPayload {
  prescription: PrescriptionRecord;
}

interface PrescriptionsPayload {
  prescriptions: PrescriptionRecord[];
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

const toQueryString = (filters: PrescriptionListFilters): string => {
  const searchParams = new URLSearchParams();

  if (filters.includeArchived) {
    searchParams.set("includeArchived", "true");
  }

  if (filters.prescriptionType) {
    searchParams.set("prescriptionType", filters.prescriptionType);
  }

  if (filters.status) {
    searchParams.set("status", filters.status);
  }

  const queryString = searchParams.toString();

  return queryString ? `?${queryString}` : "";
};

export const listPrescriptionsRequest = async (
  patientId: string,
  filters: PrescriptionListFilters = {},
): Promise<PrescriptionRecord[]> => {
  const payload = await requestJson<PrescriptionsPayload>(
    `/patients/${patientId}/prescriptions${toQueryString(filters)}`,
    {
      method: "GET",
    },
    "Unable to load prescriptions.",
  );

  return payload.prescriptions;
};

export const createPrescriptionRequest = async (
  patientId: string,
  payload: PrescriptionUpsertPayload,
): Promise<PrescriptionRecord> => {
  const response = await requestJson<PrescriptionPayload>(
    `/patients/${patientId}/prescriptions`,
    {
      body: JSON.stringify(payload),
      method: "POST",
    },
    "Unable to create the prescription.",
  );

  return response.prescription;
};

export const updatePrescriptionRequest = async (
  prescriptionId: string,
  payload: Partial<PrescriptionUpsertPayload>,
): Promise<PrescriptionRecord> => {
  const requestBody: Partial<PrescriptionUpsertPayload> = {};

  if (payload.expirationDate !== undefined) {
    requestBody.expirationDate = payload.expirationDate;
  }

  if (payload.issueDate !== undefined) {
    requestBody.issueDate = payload.issueDate;
  }

  if (payload.notes !== undefined) {
    requestBody.notes = payload.notes;
  }

  if (payload.prescriptionType !== undefined) {
    requestBody.prescriptionType = payload.prescriptionType;
  }

  if (payload.subtype !== undefined) {
    requestBody.subtype = payload.subtype;
  }

  if (payload.taskId !== undefined) {
    requestBody.taskId = payload.taskId;
  }

  const response = await requestJson<PrescriptionPayload>(
    `/prescriptions/${prescriptionId}`,
    {
      body: JSON.stringify(requestBody),
      method: "PATCH",
    },
    "Unable to update the prescription.",
  );

  return response.prescription;
};

export const updatePrescriptionStatusRequest = async (
  prescriptionId: string,
  payload: PrescriptionStatusPayload,
): Promise<PrescriptionRecord> => {
  const response = await requestJson<PrescriptionPayload>(
    `/prescriptions/${prescriptionId}/status`,
    {
      body: JSON.stringify(payload),
      method: "PATCH",
    },
    "Unable to update the prescription status.",
  );

  return response.prescription;
};
