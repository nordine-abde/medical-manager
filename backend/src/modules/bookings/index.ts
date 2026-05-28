import { Elysia, t } from "elysia";

import type { auth } from "../../auth";
import { requireRequestSession } from "../../auth/session";
import {
  legacyPrescriptionTypeAlias,
  type PrescriptionType,
  prescriptionTypes,
} from "../prescriptions/repository";
import type { BookingListFilters } from "./repository";
import {
  BookingAccessError,
  createBookingsService,
  PatientBookingAccessError,
} from "./service";

const acceptedPrescriptionTypes = [
  ...prescriptionTypes,
  legacyPrescriptionTypeAlias,
] as const;

const prescriptionTypeSchema = t.Union(
  acceptedPrescriptionTypes.map((prescriptionType) =>
    t.Literal(prescriptionType),
  ),
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
  facility: t.Optional(
    t.Nullable(
      t.Object({
        address: t.Optional(t.Nullable(t.String())),
        city: t.Optional(t.Nullable(t.String())),
        facilityType: t.Optional(t.Nullable(t.String())),
        name: t.String(),
        notes: t.Optional(t.Nullable(t.String())),
      }),
    ),
  ),
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
  title: t.Optional(t.String()),
});

const bookingUpdateBodySchema = t.Object({
  appointmentAt: t.Optional(t.Nullable(dateTimeSchema)),
  bookedAt: t.Optional(t.Nullable(dateTimeSchema)),
  facility: t.Optional(
    t.Nullable(
      t.Object({
        address: t.Optional(t.Nullable(t.String())),
        city: t.Optional(t.Nullable(t.String())),
        facilityType: t.Optional(t.Nullable(t.String())),
        name: t.String(),
        notes: t.Optional(t.Nullable(t.String())),
      }),
    ),
  ),
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
  title: t.Optional(t.String()),
});

const bookingListQuerySchema = t.Object({
  facilityId: t.Optional(
    t.String({
      format: "uuid",
    }),
  ),
  from: t.Optional(dateTimeSchema),
  hideCompleted: t.Optional(t.Union([t.Literal("true"), t.Literal("false")])),
  includeArchived: t.Optional(t.Union([t.Literal("true"), t.Literal("false")])),
  page: t.Optional(t.String()),
  pageSize: t.Optional(t.String()),
  prescriptionId: t.Optional(
    t.String({
      format: "uuid",
    }),
  ),
  prescriptionType: t.Optional(prescriptionTypeSchema),
  search: t.Optional(t.String()),
  subtype: t.Optional(t.String()),
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

const mapBooking = (booking: {
  appointment_at: Date | null;
  booked_at: Date | null;
  created_at: Date;
  deleted_at: Date | null;
  facility_id: string | null;
  id: string;
  notes: string | null;
  patient_id: string;
  prescription_id: string | null;
  title: string;
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
  title: booking.title,
  updatedAt: booking.updated_at.toISOString(),
});

const parseIncludeArchived = (value?: "true" | "false"): boolean =>
  value === "true";

const parseBooleanQuery = (value?: "true" | "false"): boolean =>
  value === "true";

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

const normalizePrescriptionType = (
  prescriptionType: string,
): PrescriptionType =>
  prescriptionType === legacyPrescriptionTypeAlias
    ? "visit"
    : (prescriptionType as PrescriptionType);

const buildBookingListFilters = (query: {
  facilityId?: string;
  from?: string;
  hideCompleted?: "true" | "false";
  includeArchived?: "true" | "false";
  page?: string;
  pageSize?: string;
  prescriptionId?: string;
  prescriptionType?: (typeof acceptedPrescriptionTypes)[number];
  search?: string;
  subtype?: string;
  to?: string;
}): BookingListFilters => {
  const filters: BookingListFilters = {
    ...buildPagination(query),
    hideCompleted: parseBooleanQuery(query.hideCompleted),
    includeArchived: parseIncludeArchived(query.includeArchived),
  };
  const from = normalizeOptionalQueryText(query.from);
  const search = normalizeOptionalQueryText(query.search);
  const subtype = normalizeOptionalQueryText(query.subtype);
  const to = normalizeOptionalQueryText(query.to);

  if (query.facilityId) {
    filters.facilityId = query.facilityId;
  }

  if (from) {
    filters.from = from;
  }

  if (query.prescriptionId) {
    filters.prescriptionId = query.prescriptionId;
  }

  if (query.prescriptionType) {
    filters.prescriptionType = normalizePrescriptionType(
      query.prescriptionType,
    );
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
          const result = await service.listBookings(
            session.user.id,
            params.patientId,
            buildBookingListFilters(query),
          );

          return {
            bookings: result.items.map(mapBooking),
            pagination: {
              page: result.page,
              pageSize: result.pageSize,
              total: result.total,
              totalPages: result.totalPages,
            },
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
              facility: body.facility
                ? {
                    address:
                      normalizeOptionalText(body.facility.address) ?? null,
                    city: normalizeOptionalText(body.facility.city) ?? null,
                    facilityType:
                      normalizeOptionalText(body.facility.facilityType) ?? null,
                    name: normalizeRequiredText(body.facility.name),
                    notes: normalizeOptionalText(body.facility.notes) ?? null,
                  }
                : null,
              facilityId: body.facilityId ?? null,
              notes: normalizeOptionalText(body.notes) ?? null,
              prescriptionId: body.prescriptionId ?? null,
              title: normalizeOptionalText(body.title) ?? null,
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
    .delete(
      "/bookings/:bookingId",
      async ({ params, request, status }) => {
        try {
          const session = await requireRequestSession(authInstance, request);
          const booking = await service.deleteBooking(
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
            facility?: {
              address: string | null;
              city: string | null;
              facilityType: string | null;
              name: string;
              notes: string | null;
            } | null;
            facilityId?: string | null;
            notes?: string | null;
            prescriptionId?: string | null;
            title?: string | null;
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

          if (body.facility !== undefined) {
            input.facility = body.facility
              ? {
                  address: normalizeOptionalText(body.facility.address) ?? null,
                  city: normalizeOptionalText(body.facility.city) ?? null,
                  facilityType:
                    normalizeOptionalText(body.facility.facilityType) ?? null,
                  name: normalizeRequiredText(body.facility.name),
                  notes: normalizeOptionalText(body.facility.notes) ?? null,
                }
              : null;
          }

          if (body.notes !== undefined) {
            input.notes = normalizeOptionalText(body.notes) ?? null;
          }

          if (body.prescriptionId !== undefined) {
            input.prescriptionId = body.prescriptionId;
          }

          if (body.title !== undefined) {
            input.title = normalizeOptionalText(body.title) ?? null;
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
    );
