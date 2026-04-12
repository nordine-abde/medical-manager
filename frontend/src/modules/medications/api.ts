import type {
  MedicationListFilters,
  MedicationRecord,
  MedicationUpsertPayload,
} from "./types";

const API_BASE_PATH = "/api/v1";

interface ApiErrorPayload {
  error?: string;
  message?: string;
}

interface MedicationPayload {
  medication: MedicationRecord;
}

interface MedicationsPayload {
  medications: MedicationRecord[];
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

const toQueryString = (filters: MedicationListFilters): string => {
  const searchParams = new URLSearchParams();

  if (filters.includeArchived) {
    searchParams.set("includeArchived", "true");
  }

  const queryString = searchParams.toString();

  return queryString ? `?${queryString}` : "";
};

export const listMedicationsRequest = async (
  patientId: string,
  filters: MedicationListFilters = {},
): Promise<MedicationRecord[]> => {
  const payload = await requestJson<MedicationsPayload>(
    `/patients/${patientId}/medications${toQueryString(filters)}`,
    {
      method: "GET",
    },
    "Unable to load medications.",
  );

  return payload.medications;
};

export const createMedicationRequest = async (
  patientId: string,
  payload: MedicationUpsertPayload,
): Promise<MedicationRecord> => {
  const response = await requestJson<MedicationPayload>(
    `/patients/${patientId}/medications`,
    {
      body: JSON.stringify(payload),
      method: "POST",
    },
    "Unable to create the medication.",
  );

  return response.medication;
};

export const updateMedicationRequest = async (
  medicationId: string,
  payload: Partial<MedicationUpsertPayload>,
): Promise<MedicationRecord> => {
  const requestBody: Partial<MedicationUpsertPayload> = {};

  if (payload.conditionId !== undefined) {
    requestBody.conditionId = payload.conditionId;
  }

  if (payload.dosage !== undefined) {
    requestBody.dosage = payload.dosage;
  }

  if (payload.name !== undefined) {
    requestBody.name = payload.name;
  }

  if (payload.nextGpContactDate !== undefined) {
    requestBody.nextGpContactDate = payload.nextGpContactDate;
  }

  if (payload.notes !== undefined) {
    requestBody.notes = payload.notes;
  }

  if (payload.prescribingDoctor !== undefined) {
    requestBody.prescribingDoctor = payload.prescribingDoctor;
  }

  if (payload.quantity !== undefined) {
    requestBody.quantity = payload.quantity;
  }

  if (payload.renewalCadence !== undefined) {
    requestBody.renewalCadence = payload.renewalCadence;
  }

  const response = await requestJson<MedicationPayload>(
    `/medications/${medicationId}`,
    {
      body: JSON.stringify(requestBody),
      method: "PATCH",
    },
    "Unable to update the medication.",
  );

  return response.medication;
};

export const archiveMedicationRequest = async (
  medicationId: string,
): Promise<MedicationRecord> => {
  const response = await requestJson<MedicationPayload>(
    `/medications/${medicationId}`,
    {
      method: "DELETE",
    },
    "Unable to archive the medication.",
  );

  return response.medication;
};
