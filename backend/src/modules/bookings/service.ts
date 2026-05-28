import { createSqlClient } from "../../db/client";
import { databaseSchemaName } from "../../db/schema";
import {
  type BookingListFilters,
  type BookingListResult,
  type BookingRecord,
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

const defaultBookingsRepository = createBookingsRepository(
  createSqlClient(),
  databaseSchemaName,
);

export const createBookingsService = (
  repository: BookingsRepository = defaultBookingsRepository,
) => ({
  async listBookings(
    userId: string,
    patientId: string,
    filters: BookingListFilters,
  ): Promise<BookingListResult> {
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

  async deleteBooking(
    userId: string,
    bookingId: string,
  ): Promise<BookingRecord> {
    const booking = await repository.deleteAccessible(userId, bookingId);

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
});

export type BookingsService = ReturnType<typeof createBookingsService>;
