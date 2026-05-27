import type { DocumentRecord } from "../documents/types";
import type {
  PrescriptionListFilters,
  PrescriptionListResult,
  PrescriptionRecord,
  PrescriptionSubtypesByType,
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

interface PrescriptionWithDocumentPayload {
  document: DocumentRecord;
  prescription: PrescriptionRecord;
}

interface PrescriptionsPayload {
  pagination: PrescriptionListResult["pagination"];
  prescriptions: PrescriptionRecord[];
}

interface PrescriptionSubtypesPayload {
  subtypesByType: PrescriptionSubtypesByType;
}

const buildRequestHeaders = (body?: BodyInit | null): HeadersInit => {
  return typeof body === "string" ? { "content-type": "application/json" } : {};
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

  if (filters.from) {
    searchParams.set("from", filters.from);
  }

  if (filters.includeArchived) {
    searchParams.set("includeArchived", "true");
  }

  if (filters.page) {
    searchParams.set("page", String(filters.page));
  }

  if (filters.pageSize) {
    searchParams.set("pageSize", String(filters.pageSize));
  }

  if (filters.prescriptionType) {
    searchParams.set("prescriptionType", filters.prescriptionType);
  }

  if (filters.search?.trim()) {
    searchParams.set("search", filters.search.trim());
  }

  if (filters.subtype?.trim()) {
    searchParams.set("subtype", filters.subtype.trim());
  }

  if (filters.to) {
    searchParams.set("to", filters.to);
  }

  const queryString = searchParams.toString();

  return queryString ? `?${queryString}` : "";
};

export const listPrescriptionsRequest = async (
  patientId: string,
  filters: PrescriptionListFilters = {},
): Promise<PrescriptionListResult> => {
  const payload = await requestJson<PrescriptionsPayload>(
    `/patients/${patientId}/prescriptions${toQueryString(filters)}`,
    {
      method: "GET",
    },
    "Unable to load prescriptions.",
  );

  return {
    pagination: payload.pagination,
    prescriptions: payload.prescriptions,
  };
};

export const listPrescriptionSubtypesRequest = async (
  patientId: string,
): Promise<PrescriptionSubtypesByType> => {
  const payload = await requestJson<PrescriptionSubtypesPayload>(
    `/patients/${patientId}/prescription-subtypes`,
    {
      method: "GET",
    },
    "Unable to load prescription subtypes.",
  );

  return payload.subtypesByType;
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

export const deletePrescriptionRequest = async (
  prescriptionId: string,
): Promise<PrescriptionRecord> => {
  const response = await requestJson<PrescriptionPayload>(
    `/prescriptions/${prescriptionId}`,
    {
      method: "DELETE",
    },
    "Unable to delete the prescription.",
  );

  return response.prescription;
};

const appendNullableFormField = (
  body: FormData,
  key: string,
  value: string | null | undefined,
) => {
  if (value !== undefined) {
    body.set(key, value ?? "");
  }
};

const buildPrescriptionDocumentFormData = (
  payload: {
    document: {
      file: File;
      notes: string | null;
    };
    prescription: Partial<PrescriptionUpsertPayload>;
  },
  includeRequiredFields: boolean,
): FormData => {
  const body = new FormData();
  body.set("file", payload.document.file);

  if (payload.document.notes) {
    body.set("documentNotes", payload.document.notes);
  }

  if (
    includeRequiredFields ||
    payload.prescription.prescriptionType !== undefined
  ) {
    body.set("prescriptionType", payload.prescription.prescriptionType ?? "");
  }

  appendNullableFormField(
    body,
    "expirationDate",
    payload.prescription.expirationDate,
  );
  appendNullableFormField(body, "issueDate", payload.prescription.issueDate);
  appendNullableFormField(body, "notes", payload.prescription.notes);
  appendNullableFormField(body, "subtype", payload.prescription.subtype);

  return body;
};

export const createPrescriptionWithDocumentRequest = async (
  patientId: string,
  payload: {
    document: {
      file: File;
      notes: string | null;
    };
    prescription: PrescriptionUpsertPayload;
  },
): Promise<PrescriptionWithDocumentPayload> =>
  requestJson<PrescriptionWithDocumentPayload>(
    `/patients/${patientId}/prescriptions/with-document`,
    {
      body: buildPrescriptionDocumentFormData(payload, true),
      method: "POST",
    },
    "Unable to create the prescription.",
  );

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

export const updatePrescriptionWithDocumentRequest = async (
  prescriptionId: string,
  payload: {
    document: {
      file: File;
      notes: string | null;
    };
    prescription: Partial<PrescriptionUpsertPayload>;
  },
): Promise<PrescriptionWithDocumentPayload> =>
  requestJson<PrescriptionWithDocumentPayload>(
    `/prescriptions/${prescriptionId}/with-document`,
    {
      body: buildPrescriptionDocumentFormData(payload, false),
      method: "PATCH",
    },
    "Unable to update the prescription.",
  );
