import type {
  BookingListFilters,
  BookingListResult,
  BookingRecord,
  BookingUpsertPayload,
  FacilityRecord,
  FacilityUpsertPayload,
} from "./types";

const API_BASE_PATH = "/api/v1";

interface ApiErrorPayload {
  error?: string;
  message?: string;
}

interface BookingPayload {
  booking: BookingRecord;
}

interface BookingsPayload {
  bookings: BookingRecord[];
  pagination: BookingListResult["pagination"];
}

interface FacilitiesPayload {
  facilities: FacilityRecord[];
}

interface FacilityPayload {
  facility: FacilityRecord;
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

const toQueryString = (filters: BookingListFilters): string => {
  const searchParams = new URLSearchParams();

  if (filters.facilityId) {
    searchParams.set("facilityId", filters.facilityId);
  }

  if (filters.from) {
    searchParams.set("from", filters.from);
  }

  if (filters.hideCompleted) {
    searchParams.set("hideCompleted", "true");
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

  if (filters.prescriptionId) {
    searchParams.set("prescriptionId", filters.prescriptionId);
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

export const listBookingsRequest = async (
  patientId: string,
  filters: BookingListFilters = {},
): Promise<BookingListResult> => {
  const payload = await requestJson<BookingsPayload>(
    `/patients/${patientId}/bookings${toQueryString(filters)}`,
    {
      method: "GET",
    },
    "Unable to load bookings.",
  );

  return {
    bookings: payload.bookings,
    pagination: payload.pagination,
  };
};

export const createBookingRequest = async (
  patientId: string,
  payload: BookingUpsertPayload,
): Promise<BookingRecord> => {
  const response = await requestJson<BookingPayload>(
    `/patients/${patientId}/bookings`,
    {
      body: JSON.stringify(payload),
      method: "POST",
    },
    "Unable to create the booking.",
  );

  return response.booking;
};

export const deleteBookingRequest = async (
  bookingId: string,
): Promise<BookingRecord> => {
  const response = await requestJson<BookingPayload>(
    `/bookings/${bookingId}`,
    {
      method: "DELETE",
    },
    "Unable to delete the booking.",
  );

  return response.booking;
};

export const updateBookingRequest = async (
  bookingId: string,
  payload: Partial<BookingUpsertPayload>,
): Promise<BookingRecord> => {
  const requestBody: Partial<BookingUpsertPayload> = {};

  if (payload.appointmentAt !== undefined) {
    requestBody.appointmentAt = payload.appointmentAt;
  }

  if (payload.bookedAt !== undefined) {
    requestBody.bookedAt = payload.bookedAt;
  }

  if (payload.facilityId !== undefined) {
    requestBody.facilityId = payload.facilityId;
  }

  if (payload.facility !== undefined) {
    requestBody.facility = payload.facility;
  }

  if (payload.notes !== undefined) {
    requestBody.notes = payload.notes;
  }

  if (payload.prescriptionId !== undefined) {
    requestBody.prescriptionId = payload.prescriptionId;
  }

  if (payload.title !== undefined) {
    requestBody.title = payload.title;
  }

  const response = await requestJson<BookingPayload>(
    `/bookings/${bookingId}`,
    {
      body: JSON.stringify(requestBody),
      method: "PATCH",
    },
    "Unable to update the booking.",
  );

  return response.booking;
};

export const listFacilitiesRequest = async (): Promise<FacilityRecord[]> => {
  const payload = await requestJson<FacilitiesPayload>(
    "/facilities",
    {
      method: "GET",
    },
    "Unable to load facilities.",
  );

  return payload.facilities;
};

export const createFacilityRequest = async (
  payload: FacilityUpsertPayload,
): Promise<FacilityRecord> => {
  const response = await requestJson<FacilityPayload>(
    "/facilities",
    {
      body: JSON.stringify(payload),
      method: "POST",
    },
    "Unable to create the facility.",
  );

  return response.facility;
};
