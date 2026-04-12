import type {
  GlobalTimelineRecord,
  PatientListFilters,
  PatientOverviewRecord,
  PatientRecord,
  PatientTimelineFilters,
  PatientTimelineRecord,
  PatientUpsertPayload,
  PatientUserRecord,
} from "./types";

const API_BASE_PATH = "/api/v1";

interface ApiErrorPayload {
  error?: string;
  message?: string;
}

interface PatientPayload {
  patient: PatientRecord;
}

interface PatientListPayload {
  patients: PatientRecord[];
}

interface PatientOverviewPayload {
  overview: PatientOverviewRecord;
}

interface PatientTimelinePayload {
  timeline: PatientTimelineRecord[];
}

interface GlobalTimelinePayload {
  timeline: GlobalTimelineRecord[];
}

interface PatientUserPayload {
  user: PatientUserRecord;
}

interface PatientUsersPayload {
  users: PatientUserRecord[];
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

const toQueryString = (filters: PatientListFilters): string => {
  const searchParams = new URLSearchParams();

  if (filters.includeArchived) {
    searchParams.set("includeArchived", "true");
  }

  if (filters.search) {
    searchParams.set("search", filters.search);
  }

  const queryString = searchParams.toString();

  return queryString ? `?${queryString}` : "";
};

const toTimelineQueryString = (filters: PatientTimelineFilters): string => {
  const searchParams = new URLSearchParams();

  if (filters.eventType) {
    searchParams.set("eventType", filters.eventType);
  }

  if (filters.startDate) {
    searchParams.set("startDate", filters.startDate);
  }

  if (filters.endDate) {
    searchParams.set("endDate", filters.endDate);
  }

  const queryString = searchParams.toString();

  return queryString ? `?${queryString}` : "";
};

export const listPatientsRequest = async (
  filters: PatientListFilters = {},
): Promise<PatientRecord[]> => {
  const payload = await requestJson<PatientListPayload>(
    `/patients${toQueryString(filters)}`,
    {
      method: "GET",
    },
    "Unable to load patients.",
  );

  return payload.patients;
};

export const createPatientRequest = async (
  payload: PatientUpsertPayload,
): Promise<PatientRecord> => {
  const response = await requestJson<PatientPayload>(
    "/patients",
    {
      body: JSON.stringify(payload),
      method: "POST",
    },
    "Unable to create the patient.",
  );

  return response.patient;
};

export const getPatientRequest = async (
  patientId: string,
): Promise<PatientRecord> => {
  const response = await requestJson<PatientPayload>(
    `/patients/${patientId}`,
    {
      method: "GET",
    },
    "Unable to load the patient.",
  );

  return response.patient;
};

export const getPatientOverviewRequest = async (
  patientId: string,
): Promise<PatientOverviewRecord> => {
  const response = await requestJson<PatientOverviewPayload>(
    `/patients/${patientId}/overview`,
    {
      method: "GET",
    },
    "Unable to load the patient overview.",
  );

  return response.overview;
};

export const listPatientTimelineRequest = async (
  patientId: string,
  filters: PatientTimelineFilters = {},
): Promise<PatientTimelineRecord[]> => {
  const response = await requestJson<PatientTimelinePayload>(
    `/patients/${patientId}/timeline${toTimelineQueryString(filters)}`,
    {
      method: "GET",
    },
    "Unable to load the patient timeline.",
  );

  return response.timeline;
};

export const listGlobalTimelineRequest = async (): Promise<
  GlobalTimelineRecord[]
> => {
  const response = await requestJson<GlobalTimelinePayload>(
    "/timeline",
    {
      method: "GET",
    },
    "Unable to load the global timeline workspace.",
  );

  return response.timeline;
};

export const updatePatientRequest = async (
  patientId: string,
  payload: PatientUpsertPayload,
): Promise<PatientRecord> => {
  const response = await requestJson<PatientPayload>(
    `/patients/${patientId}`,
    {
      body: JSON.stringify(payload),
      method: "PATCH",
    },
    "Unable to update the patient.",
  );

  return response.patient;
};

export const archivePatientRequest = async (
  patientId: string,
): Promise<PatientRecord> => {
  const response = await requestJson<PatientPayload>(
    `/patients/${patientId}`,
    {
      method: "DELETE",
    },
    "Unable to archive the patient.",
  );

  return response.patient;
};

export const restorePatientRequest = async (
  patientId: string,
): Promise<PatientRecord> => {
  const response = await requestJson<PatientPayload>(
    `/patients/${patientId}/restore`,
    {
      method: "POST",
    },
    "Unable to restore the patient.",
  );

  return response.patient;
};

export const listPatientUsersRequest = async (
  patientId: string,
): Promise<PatientUserRecord[]> => {
  const response = await requestJson<PatientUsersPayload>(
    `/patients/${patientId}/users`,
    {
      method: "GET",
    },
    "Unable to load patient collaborators.",
  );

  return response.users;
};

export const addPatientUserRequest = async (
  patientId: string,
  identifier: string,
): Promise<PatientUserRecord> => {
  const response = await requestJson<PatientUserPayload>(
    `/patients/${patientId}/users`,
    {
      body: JSON.stringify({
        identifier,
      }),
      method: "POST",
    },
    "Unable to add the collaborator.",
  );

  return response.user;
};

export const removePatientUserRequest = async (
  patientId: string,
  userId: string,
): Promise<PatientUserRecord> => {
  const response = await requestJson<PatientUserPayload>(
    `/patients/${patientId}/users/${userId}`,
    {
      method: "DELETE",
    },
    "Unable to remove the collaborator.",
  );

  return response.user;
};
