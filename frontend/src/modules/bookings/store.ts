import { defineStore } from "pinia";

import {
  createBookingRequest,
  createFacilityRequest,
  listBookingsRequest,
  listFacilitiesRequest,
  updateBookingRequest,
  updateBookingStatusRequest,
} from "./api";
import type {
  BookingListFilters,
  BookingRecord,
  BookingStatus,
  BookingStatusPayload,
  BookingUpsertPayload,
  FacilityRecord,
  FacilityUpsertPayload,
} from "./types";

interface UpdateBookingOptions {
  statusPayload?: BookingStatusPayload;
}

interface BookingsState {
  bookings: BookingRecord[];
  facilities: FacilityRecord[];
  status: "idle" | "loading" | "ready";
}

const sortFacilities = (facilities: FacilityRecord[]): FacilityRecord[] =>
  [...facilities].sort((left, right) => {
    const nameOrder = left.name.localeCompare(right.name);

    if (nameOrder !== 0) {
      return nameOrder;
    }

    return (left.city ?? "").localeCompare(right.city ?? "");
  });

const sortBookings = (bookings: BookingRecord[]): BookingRecord[] =>
  [...bookings].sort((left, right) => {
    const leftDate =
      left.appointmentAt ?? left.bookedAt ?? left.updatedAt ?? left.createdAt;
    const rightDate =
      right.appointmentAt ??
      right.bookedAt ??
      right.updatedAt ??
      right.createdAt;
    const dateOrder = leftDate.localeCompare(rightDate);

    if (dateOrder !== 0) {
      return dateOrder;
    }

    return left.createdAt.localeCompare(right.createdAt);
  });

const upsertBooking = (
  bookings: BookingRecord[],
  booking: BookingRecord,
): BookingRecord[] => {
  const existingIndex = bookings.findIndex((item) => item.id === booking.id);

  if (existingIndex === -1) {
    return sortBookings([...bookings, booking]);
  }

  return sortBookings(
    bookings.map((item) => (item.id === booking.id ? booking : item)),
  );
};

const upsertFacility = (
  facilities: FacilityRecord[],
  facility: FacilityRecord,
): FacilityRecord[] => {
  const existingIndex = facilities.findIndex((item) => item.id === facility.id);

  if (existingIndex === -1) {
    return sortFacilities([...facilities, facility]);
  }

  return sortFacilities(
    facilities.map((item) => (item.id === facility.id ? facility : item)),
  );
};

const matchesFilters = (
  booking: BookingRecord,
  filters: BookingListFilters,
): boolean => {
  if (!filters.includeArchived && booking.deletedAt !== null) {
    return false;
  }

  if (filters.facilityId && booking.facilityId !== filters.facilityId) {
    return false;
  }

  if (filters.status && booking.status !== filters.status) {
    return false;
  }

  if (filters.from) {
    const bookingDate = booking.appointmentAt ?? booking.bookedAt;

    if (bookingDate && bookingDate < filters.from) {
      return false;
    }
  }

  if (filters.to) {
    const bookingDate = booking.appointmentAt ?? booking.bookedAt;

    if (bookingDate && bookingDate > filters.to) {
      return false;
    }
  }

  return true;
};

let lastPatientId = "";
let lastListFilters: BookingListFilters = {};

export const useBookingsStore = defineStore("bookings", {
  state: (): BookingsState => ({
    bookings: [],
    facilities: [],
    status: "idle",
  }),
  getters: {
    activeBookings: (state) =>
      state.bookings.filter((booking) => booking.deletedAt === null),
  },
  actions: {
    async loadBookings(patientId: string, filters: BookingListFilters = {}) {
      this.status = "loading";
      lastPatientId = patientId;
      lastListFilters = {
        includeArchived: filters.includeArchived ?? false,
        ...(filters.facilityId ? { facilityId: filters.facilityId } : {}),
        ...(filters.from ? { from: filters.from } : {}),
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.to ? { to: filters.to } : {}),
      };

      try {
        this.bookings = sortBookings(
          await listBookingsRequest(patientId, lastListFilters),
        );
        this.status = "ready";
      } catch (error) {
        this.status = "ready";
        throw error;
      }
    },
    async loadFacilities() {
      this.facilities = sortFacilities(await listFacilitiesRequest());
    },
    async refreshBookings() {
      if (!lastPatientId) {
        return;
      }

      await this.loadBookings(lastPatientId, lastListFilters);
    },
    async createFacility(
      payload: FacilityUpsertPayload,
    ): Promise<FacilityRecord> {
      const facility = await createFacilityRequest(payload);
      this.facilities = upsertFacility(this.facilities, facility);
      return facility;
    },
    async createBooking(
      patientId: string,
      payload: BookingUpsertPayload,
    ): Promise<BookingRecord> {
      const booking = await createBookingRequest(patientId, payload);

      if (matchesFilters(booking, lastListFilters)) {
        this.bookings = upsertBooking(this.bookings, booking);
      }

      return booking;
    },
    async updateBooking(
      bookingId: string,
      payload: Partial<BookingUpsertPayload>,
      options: UpdateBookingOptions = {},
    ): Promise<BookingRecord> {
      let booking: BookingRecord | null = null;

      if (Object.keys(payload).length > 0) {
        booking = await updateBookingRequest(bookingId, payload);
      }

      const currentStatus =
        booking?.status ??
        this.bookings.find((item) => item.id === bookingId)?.status;

      if (
        options.statusPayload &&
        (currentStatus !== options.statusPayload.status ||
          options.statusPayload.appointmentAt !== undefined ||
          options.statusPayload.bookedAt !== undefined)
      ) {
        booking = await updateBookingStatusRequest(
          bookingId,
          options.statusPayload,
        );
      }

      if (!booking) {
        throw new Error("No booking changes were submitted.");
      }

      if (matchesFilters(booking, lastListFilters)) {
        this.bookings = upsertBooking(this.bookings, booking);
      } else {
        this.bookings = this.bookings.filter((item) => item.id !== bookingId);
      }

      return booking;
    },
    async changeBookingStatus(
      bookingId: string,
      status: BookingStatus,
    ): Promise<BookingRecord> {
      const booking = await updateBookingStatusRequest(bookingId, { status });

      if (matchesFilters(booking, lastListFilters)) {
        this.bookings = upsertBooking(this.bookings, booking);
      } else {
        this.bookings = this.bookings.filter((item) => item.id !== bookingId);
      }

      return booking;
    },
  },
});
