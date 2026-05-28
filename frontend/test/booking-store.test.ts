import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useBookingsStore } from "../src/modules/bookings/store";
import type { BookingRecord } from "../src/modules/bookings/types";

const mockFetch = vi.fn<typeof fetch>();

const bookingPayload: BookingRecord = {
  appointmentAt: "2026-03-24T10:00:00.000Z",
  bookedAt: "2026-03-20T11:00:00.000Z",
  createdAt: "2026-03-20T09:00:00.000Z",
  deletedAt: null,
  facilityId: "facility-1",
  id: "booking-1",
  notes: "Neurology follow-up.",
  patientId: "patient-1",
  prescriptionId: null,
  title: "Neurology follow-up",
  updatedAt: "2026-03-20T09:00:00.000Z",
};

const paginationPayload = {
  page: 1,
  pageSize: 20,
  total: 1,
  totalPages: 1,
};

const bookingsResponse = (
  bookings = [bookingPayload],
  pagination = paginationPayload,
) =>
  new Response(
    JSON.stringify({
      bookings,
      pagination,
    }),
    {
      headers: { "content-type": "application/json" },
      status: 200,
    },
  );

describe("useBookingsStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
  });

  it("loads paginated patient bookings and facilities", async () => {
    const store = useBookingsStore();

    mockFetch.mockResolvedValueOnce(bookingsResponse()).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          facilities: [
            {
              address: "Via Roma 10",
              city: "Bologna",
              createdAt: "2026-03-20T09:00:00.000Z",
              facilityType: "Clinic",
              id: "facility-1",
              name: "San Luca Clinic",
              notes: null,
              updatedAt: "2026-03-20T09:00:00.000Z",
            },
          ],
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      ),
    );

    await store.loadBookings("patient-1");
    await store.loadFacilities();

    expect(store.bookings).toHaveLength(1);
    expect(store.bookings[0]?.title).toBe("Neurology follow-up");
    expect(store.pagination.total).toBe(1);
    expect(store.facilities).toHaveLength(1);
    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      "/api/v1/patients/patient-1/bookings?page=1&pageSize=20",
      {
        credentials: "include",
        headers: {},
        method: "GET",
      },
    );
    expect(mockFetch).toHaveBeenNthCalledWith(2, "/api/v1/facilities", {
      credentials: "include",
      headers: {},
      method: "GET",
    });
  });

  it("creates facilities and keeps them sorted for selection", async () => {
    const store = useBookingsStore();

    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          facility: {
            address: "Piazza Maggiore 1",
            city: "Bologna",
            createdAt: "2026-03-20T11:00:00.000Z",
            facilityType: "Hospital",
            id: "facility-2",
            name: "Arcispedale",
            notes: "Front desk uses the east entrance.",
            updatedAt: "2026-03-20T11:00:00.000Z",
          },
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      ),
    );

    const facility = await store.createFacility({
      address: "Piazza Maggiore 1",
      city: "Bologna",
      facilityType: "Hospital",
      name: "Arcispedale",
      notes: "Front desk uses the east entrance.",
    });

    expect(facility.name).toBe("Arcispedale");
    expect(store.facilities[0]?.id).toBe("facility-2");
    expect(mockFetch).toHaveBeenCalledWith("/api/v1/facilities", {
      body: JSON.stringify({
        address: "Piazza Maggiore 1",
        city: "Bologna",
        facilityType: "Hospital",
        name: "Arcispedale",
        notes: "Front desk uses the east entrance.",
      }),
      credentials: "include",
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    });
  });

  it("creates a booking with a title and nested facility, then refreshes the current page", async () => {
    const store = useBookingsStore();

    const createdBooking = {
      ...bookingPayload,
      facilityId: "facility-3",
      id: "booking-4",
      notes: "First visit at a new facility.",
      prescriptionId: "prescription-1",
      title: "Visit - First intake",
    };

    mockFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ booking: createdBooking }), {
          headers: { "content-type": "application/json" },
          status: 200,
        }),
      )
      .mockResolvedValueOnce(bookingsResponse([createdBooking]));

    const booking = await store.createBooking("patient-1", {
      appointmentAt: "2026-03-24T10:00:00.000Z",
      bookedAt: "2026-03-20T09:00:00.000Z",
      facility: {
        address: "Via Nuova 1",
        city: "Milan",
        facilityType: "Clinic",
        name: "New Care Clinic",
        notes: null,
      },
      facilityId: null,
      notes: "First visit at a new facility.",
      prescriptionId: "prescription-1",
      title: "Visit - First intake",
    });

    expect(booking.title).toBe("Visit - First intake");
    expect(store.bookings[0]?.id).toBe("booking-4");
    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      "/api/v1/patients/patient-1/bookings",
      {
        body: JSON.stringify({
          appointmentAt: "2026-03-24T10:00:00.000Z",
          bookedAt: "2026-03-20T09:00:00.000Z",
          facility: {
            address: "Via Nuova 1",
            city: "Milan",
            facilityType: "Clinic",
            name: "New Care Clinic",
            notes: null,
          },
          facilityId: null,
          notes: "First visit at a new facility.",
          prescriptionId: "prescription-1",
          title: "Visit - First intake",
        }),
        credentials: "include",
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      },
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      "/api/v1/patients/patient-1/bookings?page=1&pageSize=20",
      {
        credentials: "include",
        headers: {},
        method: "GET",
      },
    );
  });

  it("updates booking details through one endpoint and refreshes the current page", async () => {
    const store = useBookingsStore();
    const updatedBooking = {
      ...bookingPayload,
      appointmentAt: "2026-03-24T11:00:00.000Z",
      facilityId: "facility-2",
      id: "booking-3",
      notes: "Moved to the afternoon intake queue.",
      prescriptionId: "prescription-1",
      title: "Updated cardiology review",
      updatedAt: "2026-03-20T11:00:00.000Z",
    };

    mockFetch
      .mockResolvedValueOnce(
        bookingsResponse([{ ...bookingPayload, id: "booking-3" }]),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ booking: updatedBooking }), {
          headers: { "content-type": "application/json" },
          status: 200,
        }),
      )
      .mockResolvedValueOnce(bookingsResponse([updatedBooking]));

    await store.loadBookings("patient-1");

    const result = await store.updateBooking("booking-3", {
      appointmentAt: "2026-03-24T11:00:00.000Z",
      facilityId: "facility-2",
      notes: "Moved to the afternoon intake queue.",
      title: "Updated cardiology review",
    });

    expect(result.title).toBe("Updated cardiology review");
    expect(store.bookings[0]?.title).toBe("Updated cardiology review");
    expect(mockFetch).toHaveBeenNthCalledWith(2, "/api/v1/bookings/booking-3", {
      body: JSON.stringify({
        appointmentAt: "2026-03-24T11:00:00.000Z",
        facilityId: "facility-2",
        notes: "Moved to the afternoon intake queue.",
        title: "Updated cardiology review",
      }),
      credentials: "include",
      headers: {
        "content-type": "application/json",
      },
      method: "PATCH",
    });
  });

  it("deletes a booking and refreshes the active list", async () => {
    const store = useBookingsStore();

    mockFetch
      .mockResolvedValueOnce(bookingsResponse())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            booking: {
              ...bookingPayload,
              deletedAt: "2026-03-21T09:00:00.000Z",
              updatedAt: "2026-03-21T09:00:00.000Z",
            },
          }),
          {
            headers: { "content-type": "application/json" },
            status: 200,
          },
        ),
      )
      .mockResolvedValueOnce(
        bookingsResponse([], {
          page: 1,
          pageSize: 20,
          total: 0,
          totalPages: 0,
        }),
      );

    await store.loadBookings("patient-1");
    await store.deleteBooking("booking-1");

    expect(store.bookings).toHaveLength(0);
    expect(mockFetch).toHaveBeenNthCalledWith(2, "/api/v1/bookings/booking-1", {
      credentials: "include",
      headers: {},
      method: "DELETE",
    });
  });
});
