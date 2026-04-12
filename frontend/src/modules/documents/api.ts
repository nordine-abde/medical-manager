import type { DocumentRecord, DocumentUploadPayload } from "./types";

const API_BASE_PATH = "/api/v1";

interface ApiErrorPayload {
  error?: string;
  message?: string;
}

interface DocumentPayload {
  document: DocumentRecord;
}

interface DocumentsPayload {
  documents: DocumentRecord[];
}

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
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, fallbackMessage));
  }

  return (await response.json()) as T;
};

export const listDocumentsRequest = async (
  patientId: string,
): Promise<DocumentRecord[]> => {
  const response = await requestJson<DocumentsPayload>(
    `/patients/${patientId}/documents`,
    {
      method: "GET",
    },
    "Unable to load documents.",
  );

  return response.documents;
};

export const uploadDocumentRequest = async (
  patientId: string,
  payload: DocumentUploadPayload,
): Promise<DocumentRecord> => {
  const body = new FormData();
  body.set("file", payload.file);
  body.set("documentType", payload.documentType);
  body.set("relatedEntityType", payload.relatedEntityType);
  body.set("relatedEntityId", payload.relatedEntityId);

  if (payload.notes) {
    body.set("notes", payload.notes);
  }

  const response = await requestJson<DocumentPayload>(
    `/patients/${patientId}/documents`,
    {
      body,
      method: "POST",
    },
    "Unable to upload the document.",
  );

  return response.document;
};
