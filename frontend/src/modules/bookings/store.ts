import { defineStore } from "pinia";

import {
  createBookingRequest,
  createFacilityRequest,
  deleteBookingRequest,
  listBookingsRequest,
  listFacilitiesRequest,
  updateBookingRequest,
} from "./api";
import type {
  BookingListFilters,
  BookingPagination,
  BookingRecord,
  BookingUpsertPayload,
  FacilityRecord,
  FacilityUpsertPayload,
} from "./types";

interface BookingsState {
  bookings: BookingRecord[];
  facilities: FacilityRecord[];
  pagination: BookingPagination;
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

    return left.title.localeCompare(right.title);
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

  if (
    filters.prescriptionId &&
    booking.prescriptionId !== filters.prescriptionId
  ) {
    return false;
  }

  if (filters.search?.trim()) {
    const search = filters.search.trim().toLowerCase();
    const searchableText = [booking.title, booking.notes ?? ""]
      .join(" ")
      .toLowerCase();

    if (!searchableText.includes(search)) {
      return false;
    }
  }

  return true;
};

let lastPatientId = "";
let lastListFilters: BookingListFilters = {
  hideCompleted: false,
  includeArchived: false,
  page: 1,
  pageSize: 20,
};

export const useBookingsStore = defineStore("bookings", {
  state: (): BookingsState => ({
    bookings: [],
    facilities: [],
    pagination: {
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 0,
    },
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
        hideCompleted: filters.hideCompleted ?? false,
        page: filters.page ?? 1,
        pageSize: filters.pageSize ?? this.pagination.pageSize,
        ...(filters.facilityId ? { facilityId: filters.facilityId } : {}),
        ...(filters.from ? { from: filters.from } : {}),
        ...(filters.prescriptionId
          ? { prescriptionId: filters.prescriptionId }
          : {}),
        ...(filters.prescriptionType
          ? { prescriptionType: filters.prescriptionType }
          : {}),
        ...(filters.search?.trim() ? { search: filters.search.trim() } : {}),
        ...(filters.subtype?.trim() ? { subtype: filters.subtype.trim() } : {}),
        ...(filters.to ? { to: filters.to } : {}),
      };

      try {
        const result = await listBookingsRequest(patientId, lastListFilters);
        this.bookings = sortBookings(result.bookings);
        this.pagination = result.pagination;
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
      if (!lastPatientId || lastPatientId !== patientId) {
        lastListFilters = {
          hideCompleted: false,
          includeArchived: false,
          page: 1,
          pageSize: this.pagination.pageSize,
        };
      }
      lastPatientId = patientId;

      await this.refreshBookings();

      return booking;
    },
    async deleteBooking(bookingId: string): Promise<BookingRecord> {
      const booking = await deleteBookingRequest(bookingId);

      if (lastPatientId) {
        await this.refreshBookings();
      } else if (matchesFilters(booking, lastListFilters)) {
        this.bookings = upsertBooking(this.bookings, booking);
      } else {
        this.bookings = this.bookings.filter((item) => item.id !== bookingId);
      }

      return booking;
    },
    async updateBooking(
      bookingId: string,
      payload: Partial<BookingUpsertPayload>,
    ): Promise<BookingRecord> {
      let booking: BookingRecord | null = null;

      const requestPayload: Partial<BookingUpsertPayload> = { ...payload };

      if (Object.keys(requestPayload).length > 0) {
        booking = await updateBookingRequest(bookingId, requestPayload);
      }

      if (!booking) {
        throw new Error("No booking changes were submitted.");
      }

      if (lastPatientId) {
        await this.refreshBookings();
      } else if (matchesFilters(booking, lastListFilters)) {
        this.bookings = upsertBooking(this.bookings, booking);
      } else {
        this.bookings = this.bookings.filter((item) => item.id !== bookingId);
      }

      return booking;
    },
  },
});
