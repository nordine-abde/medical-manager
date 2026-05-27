import { Elysia, t } from "elysia";

import type { auth } from "../../auth";
import { requireRequestSession } from "../../auth/session";
import { mapDocument } from "../documents/dto";
import { type DocumentType, documentTypes } from "../documents/repository";
import { UnsupportedDocumentMimeTypeError } from "../documents/storage";
import {
  type CareEventListFilters,
  type CareEventType,
  careEventTypes,
} from "./repository";
import {
  CareEventAccessError,
  createCareEventsService,
  PatientCareEventAccessError,
} from "./service";

const careEventTypeSchema = t.Union(
  careEventTypes.map((eventType) => t.Literal(eventType)),
);

const dateTimeSchema = t.String({
  format: "date-time",
});

const patientIdParamsSchema = t.Object({
  patientId: t.String({
    format: "uuid",
  }),
});

const careEventIdParamsSchema = t.Object({
  careEventId: t.String({
    format: "uuid",
  }),
});

const careEventBodySchema = t.Object({
  bookingId: t.Optional(
    t.Nullable(
      t.String({
        format: "uuid",
      }),
    ),
  ),
  completedAt: dateTimeSchema,
  eventType: careEventTypeSchema,
  facilityId: t.Optional(
    t.Nullable(
      t.String({
        format: "uuid",
      }),
    ),
  ),
  outcomeNotes: t.Optional(t.Nullable(t.String())),
  providerName: t.Optional(t.Nullable(t.String())),
  subtype: t.Optional(t.Nullable(t.String())),
});

const careEventUpdateBodySchema = t.Object({
  bookingId: t.Optional(
    t.Nullable(
      t.String({
        format: "uuid",
      }),
    ),
  ),
  completedAt: t.Optional(dateTimeSchema),
  eventType: t.Optional(careEventTypeSchema),
  facilityId: t.Optional(
    t.Nullable(
      t.String({
        format: "uuid",
      }),
    ),
  ),
  outcomeNotes: t.Optional(t.Nullable(t.String())),
  providerName: t.Optional(t.Nullable(t.String())),
  subtype: t.Optional(t.Nullable(t.String())),
  taskId: t.Optional(
    t.Nullable(
      t.String({
        format: "uuid",
      }),
    ),
  ),
});

const careEventListQuerySchema = t.Object({
  bookingId: t.Optional(
    t.String({
      format: "uuid",
    }),
  ),
  eventType: t.Optional(careEventTypeSchema),
  facilityId: t.Optional(
    t.String({
      format: "uuid",
    }),
  ),
  from: t.Optional(t.String()),
  page: t.Optional(t.String()),
  pageSize: t.Optional(t.String()),
  search: t.Optional(t.String()),
  subtype: t.Optional(t.String()),
  taskId: t.Optional(
    t.String({
      format: "uuid",
    }),
  ),
  to: t.Optional(t.String()),
});

const unauthorizedPayload = {
  error: "unauthorized",
  message: "Authentication required.",
} as const;

const patientNotFoundPayload = {
  error: "patient_not_found",
  message: "Patient not found.",
} as const;

const careEventNotFoundPayload = {
  error: "care_event_not_found",
  message: "Care event not found.",
} as const;

const invalidMultipartPayload = {
  error: "validation_error",
  message: "A multipart form with a careEvent payload is required.",
} as const;

const unsupportedDocumentTypePayload = {
  error: "unsupported_document_type",
  message: "Uploaded file type is not supported.",
} as const;

const formatDateTime = (value: Date | null): string | null =>
  value?.toISOString() ?? null;

const normalizeOptionalText = (
  value?: string | null,
): string | null | undefined => {
  if (value === undefined) {
    return undefined;
  }

  return value?.trim() || null;
};

const normalizeRequiredText = (value: string): string => value.trim();

const normalizeOptionalQueryText = (value?: string): string | undefined => {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
};

const parsePositiveInteger = (
  value: string | undefined,
  fallback: number,
): number => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const buildPagination = (query: {
  page?: string;
  pageSize?: string;
}): {
  page: number;
  pageSize: number;
} => {
  const page = parsePositiveInteger(query.page, 1);
  const pageSize = Math.min(parsePositiveInteger(query.pageSize, 20), 100);

  return {
    page,
    pageSize,
  };
};

const buildCareEventListFilters = (query: {
  bookingId?: string;
  eventType?: (typeof careEventTypes)[number];
  facilityId?: string;
  from?: string;
  page?: string;
  pageSize?: string;
  search?: string;
  subtype?: string;
  to?: string;
}): CareEventListFilters => {
  const filters: CareEventListFilters = buildPagination(query);
  const from = normalizeOptionalQueryText(query.from);
  const search = normalizeOptionalQueryText(query.search);
  const subtype = normalizeOptionalQueryText(query.subtype);
  const to = normalizeOptionalQueryText(query.to);

  if (query.bookingId) {
    filters.bookingId = query.bookingId;
  }

  if (query.eventType) {
    filters.eventType = query.eventType;
  }

  if (query.facilityId) {
    filters.facilityId = query.facilityId;
  }

  if (from) {
    filters.from = from;
  }

  if (search) {
    filters.search = search;
  }

  if (subtype) {
    filters.subtype = subtype;
  }

  if (to) {
    filters.to = to;
  }

  return filters;
};

const mapCareEvent = (careEvent: {
  booking_id: string | null;
  completed_at: Date;
  created_at: Date;
  event_type: (typeof careEventTypes)[number];
  facility_id: string | null;
  id: string;
  outcome_notes: string | null;
  patient_id: string;
  provider_name: string | null;
  subtype: string | null;
  updated_at: Date;
}) => ({
  bookingId: careEvent.booking_id,
  completedAt: careEvent.completed_at.toISOString(),
  createdAt: careEvent.created_at.toISOString(),
  eventType: careEvent.event_type,
  facilityId: careEvent.facility_id,
  id: careEvent.id,
  outcomeNotes: careEvent.outcome_notes,
  patientId: careEvent.patient_id,
  providerName: careEvent.provider_name,
  subtype: careEvent.subtype,
  updatedAt: formatDateTime(careEvent.updated_at),
});

const mapCareEventSubtypesByType = (
  subtypes: Array<{
    event_type: (typeof careEventTypes)[number];
    subtype: string;
  }>,
) => {
  const subtypeMap: Record<(typeof careEventTypes)[number], string[]> = {
    exam: [],
    specialist_visit: [],
    treatment: [],
  };

  for (const subtype of subtypes) {
    subtypeMap[subtype.event_type].push(subtype.subtype);
  }

  return subtypeMap;
};

type RequestFormData = Awaited<ReturnType<Request["formData"]>>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isCareEventType = (value: string): value is CareEventType =>
  careEventTypes.includes(value as CareEventType);

const isDocumentType = (value: string): value is DocumentType =>
  documentTypes.includes(value as DocumentType);

const parseJsonFormRecord = (
  formData: RequestFormData,
  key: string,
): Record<string, unknown> | null => {
  const entry = formData.get(key);

  if (typeof entry !== "string" || !entry.trim()) {
    return null;
  }

  const parsed = JSON.parse(entry) as unknown;

  return isRecord(parsed) ? parsed : null;
};

const readOptionalText = (
  record: Record<string, unknown>,
  key: string,
): string | null =>
  typeof record[key] === "string"
    ? (normalizeOptionalText(record[key]) ?? null)
    : null;

const readOptionalId = (
  record: Record<string, unknown>,
  key: string,
): string | null => (typeof record[key] === "string" ? record[key] : null);

const parseFacilityPayload = (record: Record<string, unknown>) => {
  if (typeof record.name !== "string") {
    return null;
  }

  return {
    address: readOptionalText(record, "address"),
    city: readOptionalText(record, "city"),
    facilityType: readOptionalText(record, "facilityType"),
    name: normalizeRequiredText(record.name),
    notes: readOptionalText(record, "notes"),
  };
};

const parseCreateCareEventPayload = (record: Record<string, unknown>) => {
  if (
    typeof record.completedAt !== "string" ||
    typeof record.eventType !== "string" ||
    !isCareEventType(record.eventType)
  ) {
    return null;
  }

  return {
    bookingId: readOptionalId(record, "bookingId"),
    completedAt: record.completedAt,
    eventType: record.eventType,
    facilityId: readOptionalId(record, "facilityId"),
    outcomeNotes: readOptionalText(record, "outcomeNotes"),
    providerName: readOptionalText(record, "providerName"),
    subtype: readOptionalText(record, "subtype"),
  };
};

const parseUpdateCareEventPayload = (record: Record<string, unknown>) => {
  const careEvent: {
    bookingId?: string | null;
    completedAt?: string;
    eventType?: CareEventType;
    facilityId?: string | null;
    outcomeNotes?: string | null;
    providerName?: string | null;
    subtype?: string | null;
  } = {};

  if ("bookingId" in record) {
    careEvent.bookingId = readOptionalId(record, "bookingId");
  }

  if ("completedAt" in record) {
    if (typeof record.completedAt !== "string") {
      return null;
    }

    careEvent.completedAt = record.completedAt;
  }

  if ("eventType" in record) {
    if (
      typeof record.eventType !== "string" ||
      !isCareEventType(record.eventType)
    ) {
      return null;
    }

    careEvent.eventType = record.eventType;
  }

  if ("facilityId" in record) {
    careEvent.facilityId = readOptionalId(record, "facilityId");
  }

  if ("outcomeNotes" in record) {
    careEvent.outcomeNotes = readOptionalText(record, "outcomeNotes");
  }

  if ("providerName" in record) {
    careEvent.providerName = readOptionalText(record, "providerName");
  }

  if ("subtype" in record) {
    careEvent.subtype = readOptionalText(record, "subtype");
  }

  return careEvent;
};

const parseCompositeDocumentPayload = (formData: RequestFormData) => {
  const fileEntry = formData.get("file");

  if (fileEntry === null) {
    return null;
  }

  const documentTypeEntry = formData.get("documentType");

  if (
    !(fileEntry instanceof File) ||
    typeof documentTypeEntry !== "string" ||
    !isDocumentType(documentTypeEntry)
  ) {
    return undefined;
  }

  const documentNotesEntry = formData.get("documentNotes");

  return {
    documentType: documentTypeEntry,
    file: fileEntry,
    notes:
      typeof documentNotesEntry === "string"
        ? (normalizeOptionalText(documentNotesEntry) ?? null)
        : null,
  };
};

const parseCreateCompositeFormData = async (request: Request) => {
  const formData = await request.formData();
  const careEventRecord = parseJsonFormRecord(formData, "careEvent");

  if (!careEventRecord) {
    return null;
  }

  const careEvent = parseCreateCareEventPayload(careEventRecord);

  if (!careEvent) {
    return null;
  }

  const facilityRecord = parseJsonFormRecord(formData, "facility");
  const facility = facilityRecord ? parseFacilityPayload(facilityRecord) : null;
  const document = parseCompositeDocumentPayload(formData);

  if (facilityRecord && !facility) {
    return null;
  }

  if (document === undefined) {
    return null;
  }

  return {
    careEvent,
    document,
    facility,
  };
};

const parseUpdateCompositeFormData = async (request: Request) => {
  const formData = await request.formData();
  const careEventRecord = parseJsonFormRecord(formData, "careEvent");

  if (!careEventRecord) {
    return null;
  }

  const careEvent = parseUpdateCareEventPayload(careEventRecord);

  if (!careEvent) {
    return null;
  }

  const facilityRecord = parseJsonFormRecord(formData, "facility");
  const facility = facilityRecord ? parseFacilityPayload(facilityRecord) : null;
  const document = parseCompositeDocumentPayload(formData);

  if (facilityRecord && !facility) {
    return null;
  }

  if (document === undefined) {
    return null;
  }

  return {
    careEvent,
    document,
    facility,
  };
};

export const createCareEventsModule = (
  authInstance: typeof auth,
  service = createCareEventsService(),
) =>
  new Elysia({ name: "care-events-module" })
    .get(
      "/patients/:patientId/care-event-subtypes",
      async ({ params, request, status }) => {
        try {
          const session = await requireRequestSession(authInstance, request);
          const subtypes = await service.listCareEventSubtypes(
            session.user.id,
            params.patientId,
          );

          return {
            subtypesByType: mapCareEventSubtypesByType(subtypes),
          };
        } catch (error) {
          if (error instanceof PatientCareEventAccessError) {
            return status(404, patientNotFoundPayload);
          }

          return status(401, unauthorizedPayload);
        }
      },
      {
        params: patientIdParamsSchema,
      },
    )
    .get(
      "/patients/:patientId/care-events",
      async ({ params, query, request, status }) => {
        try {
          const session = await requireRequestSession(authInstance, request);
          const result = await service.listCareEvents(
            session.user.id,
            params.patientId,
            buildCareEventListFilters(query),
          );

          return {
            careEvents: result.items.map(mapCareEvent),
            pagination: {
              page: result.page,
              pageSize: result.pageSize,
              total: result.total,
              totalPages: result.totalPages,
            },
          };
        } catch (error) {
          if (error instanceof PatientCareEventAccessError) {
            return status(404, patientNotFoundPayload);
          }

          return status(401, unauthorizedPayload);
        }
      },
      {
        params: patientIdParamsSchema,
        query: careEventListQuerySchema,
      },
    )
    .post(
      "/patients/:patientId/care-events",
      async ({ body, params, request, status }) => {
        try {
          const session = await requireRequestSession(authInstance, request);
          const careEvent = await service.createCareEvent(
            session.user.id,
            params.patientId,
            {
              bookingId: body.bookingId ?? null,
              completedAt: body.completedAt,
              eventType: body.eventType,
              facilityId: body.facilityId ?? null,
              outcomeNotes: normalizeOptionalText(body.outcomeNotes) ?? null,
              providerName: normalizeOptionalText(body.providerName) ?? null,
              subtype: normalizeOptionalText(body.subtype) ?? null,
            },
          );

          return {
            careEvent: mapCareEvent(careEvent),
          };
        } catch (error) {
          if (error instanceof PatientCareEventAccessError) {
            return status(404, patientNotFoundPayload);
          }

          return status(401, unauthorizedPayload);
        }
      },
      {
        body: careEventBodySchema,
        params: patientIdParamsSchema,
      },
    )
    .post(
      "/patients/:patientId/care-events/with-related-data",
      async ({ params, request, status }) => {
        let parsedFormData: Awaited<
          ReturnType<typeof parseCreateCompositeFormData>
        >;

        try {
          parsedFormData = await parseCreateCompositeFormData(request);
        } catch {
          return status(400, invalidMultipartPayload);
        }

        if (!parsedFormData) {
          return status(400, invalidMultipartPayload);
        }

        try {
          const session = await requireRequestSession(authInstance, request);
          const result = await service.createCareEventWithRelatedData(
            session.user.id,
            params.patientId,
            {
              ...parsedFormData.careEvent,
              document: parsedFormData.document
                ? {
                    documentType: parsedFormData.document.documentType,
                    fileBytes: await parsedFormData.document.file.arrayBuffer(),
                    mimeType: parsedFormData.document.file.type,
                    notes: parsedFormData.document.notes,
                    originalFilename:
                      parsedFormData.document.file.name || "document",
                    uploadedByUserId: session.user.id,
                  }
                : null,
              facility: parsedFormData.facility,
            },
          );

          return {
            careEvent: mapCareEvent(result.careEvent),
            document: result.document ? mapDocument(result.document) : null,
          };
        } catch (error) {
          if (error instanceof PatientCareEventAccessError) {
            return status(404, patientNotFoundPayload);
          }

          if (error instanceof UnsupportedDocumentMimeTypeError) {
            return status(400, unsupportedDocumentTypePayload);
          }

          return status(401, unauthorizedPayload);
        }
      },
      {
        params: patientIdParamsSchema,
      },
    )
    .get(
      "/care-events/:careEventId",
      async ({ params, request, status }) => {
        try {
          const session = await requireRequestSession(authInstance, request);
          const careEvent = await service.getCareEvent(
            session.user.id,
            params.careEventId,
          );

          return {
            careEvent: mapCareEvent(careEvent),
          };
        } catch (error) {
          if (error instanceof CareEventAccessError) {
            return status(404, careEventNotFoundPayload);
          }

          return status(401, unauthorizedPayload);
        }
      },
      {
        params: careEventIdParamsSchema,
      },
    )
    .delete(
      "/care-events/:careEventId",
      async ({ params, request, status }) => {
        try {
          const session = await requireRequestSession(authInstance, request);
          const careEvent = await service.deleteCareEvent(
            session.user.id,
            params.careEventId,
          );

          return {
            careEvent: mapCareEvent(careEvent),
          };
        } catch (error) {
          if (error instanceof CareEventAccessError) {
            return status(404, careEventNotFoundPayload);
          }

          return status(401, unauthorizedPayload);
        }
      },
      {
        params: careEventIdParamsSchema,
      },
    )
    .patch(
      "/care-events/:careEventId",
      async ({ body, params, request, status }) => {
        try {
          const session = await requireRequestSession(authInstance, request);
          const careEvent = await service.updateCareEvent(
            session.user.id,
            params.careEventId,
            {
              ...(body.bookingId === undefined
                ? {}
                : { bookingId: body.bookingId }),
              ...(body.completedAt === undefined
                ? {}
                : { completedAt: body.completedAt }),
              ...(body.eventType === undefined
                ? {}
                : { eventType: body.eventType }),
              ...(body.facilityId === undefined
                ? {}
                : { facilityId: body.facilityId }),
              ...(body.outcomeNotes === undefined
                ? {}
                : {
                    outcomeNotes:
                      normalizeOptionalText(body.outcomeNotes) ?? null,
                  }),
              ...(body.providerName === undefined
                ? {}
                : {
                    providerName:
                      normalizeOptionalText(body.providerName) ?? null,
                  }),
              ...(body.subtype === undefined
                ? {}
                : {
                    subtype: normalizeOptionalText(body.subtype) ?? null,
                  }),
            },
          );

          return {
            careEvent: mapCareEvent(careEvent),
          };
        } catch (error) {
          if (error instanceof CareEventAccessError) {
            return status(404, careEventNotFoundPayload);
          }

          return status(401, unauthorizedPayload);
        }
      },
      {
        body: careEventUpdateBodySchema,
        params: careEventIdParamsSchema,
      },
    )
    .patch(
      "/care-events/:careEventId/with-related-data",
      async ({ params, request, status }) => {
        let parsedFormData: Awaited<
          ReturnType<typeof parseUpdateCompositeFormData>
        >;

        try {
          parsedFormData = await parseUpdateCompositeFormData(request);
        } catch {
          return status(400, invalidMultipartPayload);
        }

        if (!parsedFormData) {
          return status(400, invalidMultipartPayload);
        }

        try {
          const session = await requireRequestSession(authInstance, request);
          const result = await service.updateCareEventWithRelatedData(
            session.user.id,
            params.careEventId,
            {
              ...parsedFormData.careEvent,
              document: parsedFormData.document
                ? {
                    documentType: parsedFormData.document.documentType,
                    fileBytes: await parsedFormData.document.file.arrayBuffer(),
                    mimeType: parsedFormData.document.file.type,
                    notes: parsedFormData.document.notes,
                    originalFilename:
                      parsedFormData.document.file.name || "document",
                    uploadedByUserId: session.user.id,
                  }
                : null,
              facility: parsedFormData.facility,
            },
          );

          return {
            careEvent: mapCareEvent(result.careEvent),
            document: result.document ? mapDocument(result.document) : null,
          };
        } catch (error) {
          if (error instanceof CareEventAccessError) {
            return status(404, careEventNotFoundPayload);
          }

          if (error instanceof UnsupportedDocumentMimeTypeError) {
            return status(400, unsupportedDocumentTypePayload);
          }

          return status(401, unauthorizedPayload);
        }
      },
      {
        params: careEventIdParamsSchema,
      },
    );
