import { Elysia, t } from "elysia";

import type { auth } from "../../auth";
import { requireRequestSession } from "../../auth/session";
import { type BookingStatus, bookingStatuses } from "./repository";
import {
  BookingAccessError,
  createBookingsService,
  InvalidBookingStatusTransitionError,
  PatientBookingAccessError,
} from "./service";

const bookingStatusSchema = t.Union(
  bookingStatuses.map((status) => t.Literal(status)),
);

const dateTimeSchema = t.String({
  format: "date-time",
});

const patientIdParamsSchema = t.Object({
  patientId: t.String({
    format: "uuid",
  }),
});

const bookingIdParamsSchema = t.Object({
  bookingId: t.String({
    format: "uuid",
  }),
});

const bookingBodySchema = t.Object({
  appointmentAt: t.Optional(t.Nullable(dateTimeSchema)),
  bookedAt: t.Optional(t.Nullable(dateTimeSchema)),
  facilityId: t.Optional(
    t.Nullable(
      t.String({
        format: "uuid",
      }),
    ),
  ),
  notes: t.Optional(t.Nullable(t.String())),
  prescriptionId: t.Optional(
    t.Nullable(
      t.String({
        format: "uuid",
      }),
    ),
  ),
  status: t.Optional(bookingStatusSchema),
  taskId: t.String({
    format: "uuid",
  }),
});

const bookingUpdateBodySchema = t.Object({
  appointmentAt: t.Optional(t.Nullable(dateTimeSchema)),
  bookedAt: t.Optional(t.Nullable(dateTimeSchema)),
  facilityId: t.Optional(
    t.Nullable(
      t.String({
        format: "uuid",
      }),
    ),
  ),
  notes: t.Optional(t.Nullable(t.String())),
  prescriptionId: t.Optional(
    t.Nullable(
      t.String({
        format: "uuid",
      }),
    ),
  ),
  taskId: t.Optional(
    t.String({
      format: "uuid",
    }),
  ),
});

const bookingStatusBodySchema = t.Object({
  appointmentAt: t.Optional(t.Nullable(dateTimeSchema)),
  bookedAt: t.Optional(t.Nullable(dateTimeSchema)),
  status: bookingStatusSchema,
});

const bookingListQuerySchema = t.Object({
  facilityId: t.Optional(
    t.String({
      format: "uuid",
    }),
  ),
  from: t.Optional(dateTimeSchema),
  includeArchived: t.Optional(t.Union([t.Literal("true"), t.Literal("false")])),
  status: t.Optional(bookingStatusSchema),
  to: t.Optional(dateTimeSchema),
});

const unauthorizedPayload = {
  error: "unauthorized",
  message: "Authentication required.",
} as const;

const patientNotFoundPayload = {
  error: "patient_not_found",
  message: "Patient not found.",
} as const;

const bookingNotFoundPayload = {
  error: "booking_not_found",
  message: "Booking not found.",
} as const;

const invalidBookingStatusTransitionPayload = {
  error: "invalid_booking_status_transition",
  message: "Booking status transition is not allowed.",
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

const mapBooking = (booking: {
  appointment_at: Date | null;
  booked_at: Date | null;
  booking_status: BookingStatus;
  created_at: Date;
  deleted_at: Date | null;
  facility_id: string | null;
  id: string;
  notes: string | null;
  patient_id: string;
  prescription_id: string | null;
  task_id: string;
  updated_at: Date;
}) => ({
  appointmentAt: formatDateTime(booking.appointment_at),
  bookedAt: formatDateTime(booking.booked_at),
  createdAt: booking.created_at.toISOString(),
  deletedAt: formatDateTime(booking.deleted_at),
  facilityId: booking.facility_id,
  id: booking.id,
  notes: booking.notes,
  patientId: booking.patient_id,
  prescriptionId: booking.prescription_id,
  status: booking.booking_status,
  taskId: booking.task_id,
  updatedAt: booking.updated_at.toISOString(),
});

const parseIncludeArchived = (value?: "true" | "false"): boolean =>
  value === "true";

export const createBookingsModule = (
  authInstance: typeof auth,
  service = createBookingsService(),
) =>
  new Elysia({ name: "bookings-module" })
    .get(
      "/patients/:patientId/bookings",
      async ({ params, query, request, status }) => {
        try {
          const session = await requireRequestSession(authInstance, request);
          const bookings = await service.listBookings(
            session.user.id,
            params.patientId,
            {
              ...(query.facilityId === undefined
                ? {}
                : { facilityId: query.facilityId }),
              ...(query.from === undefined ? {} : { from: query.from }),
              includeArchived: parseIncludeArchived(query.includeArchived),
              ...(query.status === undefined ? {} : { status: query.status }),
              ...(query.to === undefined ? {} : { to: query.to }),
            },
          );

          return {
            bookings: bookings.map(mapBooking),
          };
        } catch (error) {
          if (error instanceof PatientBookingAccessError) {
            return status(404, patientNotFoundPayload);
          }

          return status(401, unauthorizedPayload);
        }
      },
      {
        params: patientIdParamsSchema,
        query: bookingListQuerySchema,
      },
    )
    .post(
      "/patients/:patientId/bookings",
      async ({ body, params, request, status }) => {
        try {
          const session = await requireRequestSession(authInstance, request);
          const booking = await service.createBooking(
            session.user.id,
            params.patientId,
            {
              appointmentAt: body.appointmentAt ?? null,
              bookedAt: body.bookedAt ?? null,
              facilityId: body.facilityId ?? null,
              notes: normalizeOptionalText(body.notes) ?? null,
              prescriptionId: body.prescriptionId ?? null,
              status: body.status ?? "not_booked",
              taskId: body.taskId,
            },
          );

          return {
            booking: mapBooking(booking),
          };
        } catch (error) {
          if (error instanceof PatientBookingAccessError) {
            return status(404, patientNotFoundPayload);
          }

          return status(401, unauthorizedPayload);
        }
      },
      {
        body: bookingBodySchema,
        params: patientIdParamsSchema,
      },
    )
    .get(
      "/bookings/:bookingId",
      async ({ params, request, status }) => {
        try {
          const session = await requireRequestSession(authInstance, request);
          const booking = await service.getBooking(
            session.user.id,
            params.bookingId,
          );

          return {
            booking: mapBooking(booking),
          };
        } catch (error) {
          if (error instanceof BookingAccessError) {
            return status(404, bookingNotFoundPayload);
          }

          return status(401, unauthorizedPayload);
        }
      },
      {
        params: bookingIdParamsSchema,
      },
    )
    .patch(
      "/bookings/:bookingId",
      async ({ body, params, request, status }) => {
        try {
          const session = await requireRequestSession(authInstance, request);
          const input: {
            appointmentAt?: string | null;
            bookedAt?: string | null;
            facilityId?: string | null;
            notes?: string | null;
            prescriptionId?: string | null;
            taskId?: string;
          } = {};

          if (body.appointmentAt !== undefined) {
            input.appointmentAt = body.appointmentAt;
          }

          if (body.bookedAt !== undefined) {
            input.bookedAt = body.bookedAt;
          }

          if (body.facilityId !== undefined) {
            input.facilityId = body.facilityId;
          }

          if (body.notes !== undefined) {
            input.notes = normalizeOptionalText(body.notes) ?? null;
          }

          if (body.prescriptionId !== undefined) {
            input.prescriptionId = body.prescriptionId;
          }

          if (body.taskId !== undefined) {
            input.taskId = body.taskId;
          }

          const booking = await service.updateBooking(
            session.user.id,
            params.bookingId,
            input,
          );

          return {
            booking: mapBooking(booking),
          };
        } catch (error) {
          if (error instanceof BookingAccessError) {
            return status(404, bookingNotFoundPayload);
          }

          return status(401, unauthorizedPayload);
        }
      },
      {
        body: bookingUpdateBodySchema,
        params: bookingIdParamsSchema,
      },
    )
    .post(
      "/bookings/:bookingId/status",
      async ({ body, params, request, status }) => {
        try {
          const session = await requireRequestSession(authInstance, request);
          const booking = await service.changeBookingStatus(
            session.user.id,
            params.bookingId,
            {
              ...(body.appointmentAt === undefined
                ? {}
                : { appointmentAt: body.appointmentAt }),
              ...(body.bookedAt === undefined
                ? {}
                : { bookedAt: body.bookedAt }),
              status: body.status,
            },
          );

          return {
            booking: mapBooking(booking),
          };
        } catch (error) {
          if (error instanceof InvalidBookingStatusTransitionError) {
            return status(409, invalidBookingStatusTransitionPayload);
          }

          if (error instanceof BookingAccessError) {
            return status(404, bookingNotFoundPayload);
          }

          return status(401, unauthorizedPayload);
        }
      },
      {
        body: bookingStatusBodySchema,
        params: bookingIdParamsSchema,
      },
    );
