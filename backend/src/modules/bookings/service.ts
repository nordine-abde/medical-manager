import { createSqlClient } from "../../db/client";
import { databaseSchemaName } from "../../db/schema";
import {
  type BookingListFilters,
  type BookingRecord,
  type BookingStatus,
  type BookingsRepository,
  type CreateBookingInput,
  createBookingsRepository,
  type UpdateBookingInput,
} from "./repository";

export class PatientBookingAccessError extends Error {
  constructor() {
    super("PATIENT_NOT_FOUND");
  }
}

export class BookingAccessError extends Error {
  constructor() {
    super("BOOKING_NOT_FOUND");
  }
}

export class InvalidBookingStatusTransitionError extends Error {
  constructor() {
    super("INVALID_BOOKING_STATUS_TRANSITION");
  }
}

const defaultBookingsRepository = createBookingsRepository(
  createSqlClient(),
  databaseSchemaName,
);

const nextAllowedStatuses: Record<BookingStatus, readonly BookingStatus[]> = {
  booked: ["completed", "cancelled"],
  booking_in_progress: ["booked", "cancelled"],
  cancelled: [],
  completed: [],
  not_booked: ["booking_in_progress", "booked", "cancelled"],
};

const assertTransitionAllowed = (
  currentStatus: BookingStatus,
  nextStatus: BookingStatus,
): void => {
  if (currentStatus === nextStatus) {
    return;
  }

  if (!nextAllowedStatuses[currentStatus].includes(nextStatus)) {
    throw new InvalidBookingStatusTransitionError();
  }
};

const normalizeStatusFields = (
  existingBooking: BookingRecord,
  status: BookingStatus,
  input: {
    appointmentAt?: string | null;
    bookedAt?: string | null;
  },
) => {
  const bookedAt =
    input.bookedAt === undefined
      ? (existingBooking.booked_at?.toISOString() ?? null)
      : input.bookedAt;
  const appointmentAt =
    input.appointmentAt === undefined
      ? (existingBooking.appointment_at?.toISOString() ?? null)
      : input.appointmentAt;

  if (status === "booked") {
    return {
      appointmentAt,
      bookedAt: bookedAt ?? new Date().toISOString(),
    };
  }

  return {
    appointmentAt,
    bookedAt,
  };
};

export const createBookingsService = (
  repository: BookingsRepository = defaultBookingsRepository,
) => ({
  async listBookings(
    userId: string,
    patientId: string,
    filters: BookingListFilters,
  ): Promise<BookingRecord[]> {
    const bookings = await repository.listByPatient(userId, patientId, filters);

    if (!bookings) {
      throw new PatientBookingAccessError();
    }

    return bookings;
  },

  async createBooking(
    userId: string,
    patientId: string,
    input: CreateBookingInput,
  ): Promise<BookingRecord> {
    const booking = await repository.create(userId, patientId, input);

    if (!booking) {
      throw new PatientBookingAccessError();
    }

    return booking;
  },

  async getBooking(userId: string, bookingId: string): Promise<BookingRecord> {
    const booking = await repository.findAccessibleById(userId, bookingId);

    if (!booking) {
      throw new BookingAccessError();
    }

    return booking;
  },

  async updateBooking(
    userId: string,
    bookingId: string,
    input: UpdateBookingInput,
  ): Promise<BookingRecord> {
    const booking = await repository.updateAccessible(userId, bookingId, input);

    if (!booking) {
      throw new BookingAccessError();
    }

    return booking;
  },

  async changeBookingStatus(
    userId: string,
    bookingId: string,
    input: {
      appointmentAt?: string | null;
      bookedAt?: string | null;
      status: BookingStatus;
    },
  ): Promise<BookingRecord> {
    const existingBooking = await repository.findAccessibleById(
      userId,
      bookingId,
    );

    if (!existingBooking || existingBooking.deleted_at) {
      throw new BookingAccessError();
    }

    assertTransitionAllowed(existingBooking.booking_status, input.status);

    const normalizedFields = normalizeStatusFields(
      existingBooking,
      input.status,
      input,
    );

    const booking = await repository.updateStatusAccessible(userId, bookingId, {
      appointmentAt: normalizedFields.appointmentAt,
      bookedAt: normalizedFields.bookedAt,
      status: input.status,
    });

    if (!booking) {
      throw new BookingAccessError();
    }

    return booking;
  },
});

export type BookingsService = ReturnType<typeof createBookingsService>;
