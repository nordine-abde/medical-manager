import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useBookingsStore } from "../src/modules/bookings/store";

const mockFetch = vi.fn<typeof fetch>();

describe("useBookingsStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
  });

  it("loads patient bookings and facilities", async () => {
    const store = useBookingsStore();

    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            bookings: [
              {
                appointmentAt: "2026-03-24T10:00:00.000Z",
                bookedAt: "2026-03-20T09:00:00.000Z",
                createdAt: "2026-03-20T09:00:00.000Z",
                deletedAt: null,
                facilityId: "facility-1",
                id: "booking-1",
                notes: "Neurology follow-up.",
                patientId: "patient-1",
                prescriptionId: null,
                status: "booked",
                taskId: "task-1",
                updatedAt: "2026-03-20T09:00:00.000Z",
              },
            ],
          }),
          {
            headers: { "content-type": "application/json" },
            status: 200,
          },
        ),
      )
      .mockResolvedValueOnce(
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
    expect(store.facilities).toHaveLength(1);
    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      "/api/v1/patients/patient-1/bookings",
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

  it("updates booking details and workflow status through separate endpoints", async () => {
    const store = useBookingsStore();

    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            bookings: [
              {
                appointmentAt: "2026-03-24T10:00:00.000Z",
                bookedAt: "2026-03-20T09:00:00.000Z",
                createdAt: "2026-03-20T09:00:00.000Z",
                deletedAt: null,
                facilityId: "facility-1",
                id: "booking-3",
                notes: "Baseline cardiology review.",
                patientId: "patient-1",
                prescriptionId: "prescription-1",
                status: "booking_in_progress",
                taskId: "task-3",
                updatedAt: "2026-03-20T09:00:00.000Z",
              },
            ],
          }),
          {
            headers: { "content-type": "application/json" },
            status: 200,
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            booking: {
              appointmentAt: "2026-03-24T11:00:00.000Z",
              bookedAt: "2026-03-20T09:00:00.000Z",
              createdAt: "2026-03-20T09:00:00.000Z",
              deletedAt: null,
              facilityId: "facility-2",
              id: "booking-3",
              notes: "Moved to the afternoon intake queue.",
              patientId: "patient-1",
              prescriptionId: "prescription-1",
              status: "booking_in_progress",
              taskId: "task-3",
              updatedAt: "2026-03-20T10:30:00.000Z",
            },
          }),
          {
            headers: { "content-type": "application/json" },
            status: 200,
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            booking: {
              appointmentAt: "2026-03-24T11:00:00.000Z",
              bookedAt: "2026-03-20T11:00:00.000Z",
              createdAt: "2026-03-20T09:00:00.000Z",
              deletedAt: null,
              facilityId: "facility-2",
              id: "booking-3",
              notes: "Moved to the afternoon intake queue.",
              patientId: "patient-1",
              prescriptionId: "prescription-1",
              status: "booked",
              taskId: "task-3",
              updatedAt: "2026-03-20T11:00:00.000Z",
            },
          }),
          {
            headers: { "content-type": "application/json" },
            status: 200,
          },
        ),
      );

    await store.loadBookings("patient-1");

    const updatedBooking = await store.updateBooking(
      "booking-3",
      {
        appointmentAt: "2026-03-24T11:00:00.000Z",
        facilityId: "facility-2",
        notes: "Moved to the afternoon intake queue.",
      },
      {
        statusPayload: {
          bookedAt: "2026-03-20T11:00:00.000Z",
          status: "booked",
        },
      },
    );

    expect(updatedBooking.status).toBe("booked");
    expect(store.bookings[0]?.bookedAt).toBe("2026-03-20T11:00:00.000Z");
    expect(mockFetch).toHaveBeenNthCalledWith(2, "/api/v1/bookings/booking-3", {
      body: JSON.stringify({
        appointmentAt: "2026-03-24T11:00:00.000Z",
        facilityId: "facility-2",
        notes: "Moved to the afternoon intake queue.",
      }),
      credentials: "include",
      headers: {
        "content-type": "application/json",
      },
      method: "PATCH",
    });
    expect(mockFetch).toHaveBeenNthCalledWith(
      3,
      "/api/v1/bookings/booking-3/status",
      {
        body: JSON.stringify({
          bookedAt: "2026-03-20T11:00:00.000Z",
          status: "booked",
        }),
        credentials: "include",
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      },
    );
  });
});
