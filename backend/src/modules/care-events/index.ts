import { Elysia, t } from "elysia";

import type { auth } from "../../auth";
import { requireRequestSession } from "../../auth/session";
import { careEventTypes } from "./repository";
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
  taskId: t.Optional(
    t.Nullable(
      t.String({
        format: "uuid",
      }),
    ),
  ),
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
  task_id: string | null;
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
  taskId: careEvent.task_id,
  updatedAt: formatDateTime(careEvent.updated_at),
});

export const createCareEventsModule = (
  authInstance: typeof auth,
  service = createCareEventsService(),
) =>
  new Elysia({ name: "care-events-module" })
    .get(
      "/patients/:patientId/care-events",
      async ({ params, request, status }) => {
        try {
          const session = await requireRequestSession(authInstance, request);
          const careEvents = await service.listCareEvents(
            session.user.id,
            params.patientId,
          );

          return {
            careEvents: careEvents.map(mapCareEvent),
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
              taskId: body.taskId ?? null,
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
              ...(body.taskId === undefined ? {} : { taskId: body.taskId }),
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
    );
