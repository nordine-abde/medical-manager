import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useCareEventsStore } from "../src/modules/care-events/store";

const mockFetch = vi.fn<typeof fetch>();

describe("useCareEventsStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
  });

  it("loads patient care events newest first", async () => {
    const store = useCareEventsStore();

    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          careEvents: [
            {
              bookingId: null,
              completedAt: "2026-03-18T10:00:00.000Z",
              createdAt: "2026-03-18T10:05:00.000Z",
              eventType: "exam",
              facilityId: null,
              id: "care-event-1",
              outcomeNotes: "Routine blood work completed.",
              patientId: "patient-1",
              providerName: "Dr. Rossi",
              subtype: "Blood test",
              taskId: "task-1",
              updatedAt: "2026-03-18T10:05:00.000Z",
            },
            {
              bookingId: "booking-1",
              completedAt: "2026-03-19T11:30:00.000Z",
              createdAt: "2026-03-19T11:40:00.000Z",
              eventType: "specialist_visit",
              facilityId: "facility-1",
              id: "care-event-2",
              outcomeNotes: null,
              patientId: "patient-1",
              providerName: "Dr. Bianchi",
              subtype: "Cardiology",
              taskId: "task-2",
              updatedAt: "2026-03-19T11:40:00.000Z",
            },
          ],
        }),
        {
          headers: {
            "content-type": "application/json",
          },
          status: 200,
        },
      ),
    );

    await store.loadCareEvents("patient-1");

    expect(store.careEvents.map((careEvent) => careEvent.id)).toEqual([
      "care-event-2",
      "care-event-1",
    ]);
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/v1/patients/patient-1/care-events",
      expect.objectContaining({
        credentials: "include",
        method: "GET",
      }),
    );
  });

  it("creates a patient care event and keeps the list updated", async () => {
    const store = useCareEventsStore();

    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            careEvents: [],
          }),
          {
            headers: {
              "content-type": "application/json",
            },
            status: 200,
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            careEvent: {
              bookingId: "booking-1",
              completedAt: "2026-03-19T16:00:00.000Z",
              createdAt: "2026-03-19T16:01:00.000Z",
              eventType: "treatment",
              facilityId: "facility-1",
              id: "care-event-3",
              outcomeNotes: "Treatment completed successfully.",
              patientId: "patient-1",
              providerName: "Nurse Verdi",
              subtype: "Physical therapy",
              taskId: "task-1",
              updatedAt: "2026-03-19T16:01:00.000Z",
            },
          }),
          {
            headers: {
              "content-type": "application/json",
            },
            status: 200,
          },
        ),
      );

    await store.loadCareEvents("patient-1");
    const createdCareEvent = await store.createCareEvent("patient-1", {
      bookingId: "booking-1",
      completedAt: "2026-03-19T16:00:00.000Z",
      eventType: "treatment",
      facilityId: "facility-1",
      outcomeNotes: "Treatment completed successfully.",
      providerName: "Nurse Verdi",
      subtype: "Physical therapy",
      taskId: "task-1",
    });

    expect(createdCareEvent.id).toBe("care-event-3");
    expect(store.careEvents[0]?.id).toBe("care-event-3");
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      "/api/v1/patients/patient-1/care-events",
      expect.objectContaining({
        credentials: "include",
        method: "POST",
      }),
    );
    expect(
      JSON.parse(String(mockFetch.mock.calls[1]?.[1]?.body)),
    ).toMatchObject({
      bookingId: "booking-1",
      completedAt: "2026-03-19T16:00:00.000Z",
      eventType: "treatment",
      facilityId: "facility-1",
      outcomeNotes: "Treatment completed successfully.",
      providerName: "Nurse Verdi",
      subtype: "Physical therapy",
      taskId: "task-1",
    });
  });
});
