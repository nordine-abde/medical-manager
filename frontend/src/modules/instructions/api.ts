import type {
  InstructionListFilters,
  InstructionRecord,
  InstructionUpsertPayload,
} from "./types";

const API_BASE_PATH = "/api/v1";

interface ApiErrorPayload {
  error?: string;
  message?: string;
}

interface InstructionPayload {
  instruction: InstructionRecord;
}

interface InstructionsPayload {
  instructions: InstructionRecord[];
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

const toQueryString = (filters: InstructionListFilters): string => {
  const searchParams = new URLSearchParams();

  if (filters.status) {
    searchParams.set("status", filters.status);
  }

  if (filters.from) {
    searchParams.set("from", filters.from);
  }

  if (filters.to) {
    searchParams.set("to", filters.to);
  }

  const queryString = searchParams.toString();

  return queryString ? `?${queryString}` : "";
};

export const listInstructionsRequest = async (
  patientId: string,
  filters: InstructionListFilters = {},
): Promise<InstructionRecord[]> => {
  const payload = await requestJson<InstructionsPayload>(
    `/patients/${patientId}/instructions${toQueryString(filters)}`,
    {
      method: "GET",
    },
    "Unable to load instructions.",
  );

  return payload.instructions;
};

export const createInstructionRequest = async (
  patientId: string,
  payload: InstructionUpsertPayload,
): Promise<InstructionRecord> => {
  const requestBody: InstructionUpsertPayload = {
    ...(payload.careEventId === undefined
      ? {}
      : { careEventId: payload.careEventId }),
    doctorName: payload.doctorName,
    instructionDate: payload.instructionDate,
    originalNotes: payload.originalNotes,
    specialty: payload.specialty,
    status: payload.status,
    targetTimingText: payload.targetTimingText,
  };

  const response = await requestJson<InstructionPayload>(
    `/patients/${patientId}/instructions`,
    {
      body: JSON.stringify(requestBody),
      method: "POST",
    },
    "Unable to create the instruction.",
  );

  return response.instruction;
};

export const getInstructionRequest = async (
  instructionId: string,
): Promise<InstructionRecord> => {
  const response = await requestJson<InstructionPayload>(
    `/instructions/${instructionId}`,
    {
      method: "GET",
    },
    "Unable to load the instruction.",
  );

  return response.instruction;
};

export const updateInstructionRequest = async (
  instructionId: string,
  payload: Partial<InstructionUpsertPayload>,
): Promise<InstructionRecord> => {
  const requestBody: Partial<InstructionUpsertPayload> = {};

  if (payload.careEventId !== undefined) {
    requestBody.careEventId = payload.careEventId;
  }

  if (payload.doctorName !== undefined) {
    requestBody.doctorName = payload.doctorName;
  }

  if (payload.instructionDate !== undefined) {
    requestBody.instructionDate = payload.instructionDate;
  }

  if (payload.originalNotes !== undefined) {
    requestBody.originalNotes = payload.originalNotes;
  }

  if (payload.specialty !== undefined) {
    requestBody.specialty = payload.specialty;
  }

  if (payload.status !== undefined) {
    requestBody.status = payload.status;
  }

  if (payload.targetTimingText !== undefined) {
    requestBody.targetTimingText = payload.targetTimingText;
  }

  const response = await requestJson<InstructionPayload>(
    `/instructions/${instructionId}`,
    {
      body: JSON.stringify(requestBody),
      method: "PATCH",
    },
    "Unable to update the instruction.",
  );

  return response.instruction;
};
