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
          pagination: {
            page: 1,
            pageSize: 20,
            total: 2,
            totalPages: 1,
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

    expect(store.careEvents.map((careEvent) => careEvent.id)).toEqual([
      "care-event-2",
      "care-event-1",
    ]);
    expect(store.pagination.total).toBe(2);
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/v1/patients/patient-1/care-events?page=1&pageSize=20",
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
            pagination: {
              page: 1,
              pageSize: 20,
              total: 0,
              totalPages: 0,
            },
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
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            careEvents: [
              {
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
                updatedAt: "2026-03-19T16:01:00.000Z",
              },
            ],
            pagination: {
              page: 1,
              pageSize: 20,
              total: 1,
              totalPages: 1,
            },
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
            subtypesByType: {
              exam: [],
              specialist_visit: [],
              treatment: ["Physical therapy"],
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
    });
    expect(mockFetch).toHaveBeenNthCalledWith(
      3,
      "/api/v1/patients/patient-1/care-events?page=1&pageSize=20",
      expect.objectContaining({
        credentials: "include",
        method: "GET",
      }),
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      4,
      "/api/v1/patients/patient-1/care-event-subtypes",
      expect.objectContaining({
        credentials: "include",
        method: "GET",
      }),
    );
    expect(store.subtypesByType.treatment).toEqual(["Physical therapy"]);
  });

  it("creates a care event with related data through the composite endpoint", async () => {
    const store = useCareEventsStore();
    const file = new File(["report"], "visit-report.pdf", {
      type: "application/pdf",
    });

    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            careEvent: {
              bookingId: null,
              completedAt: "2026-03-20T09:00:00.000Z",
              createdAt: "2026-03-20T09:01:00.000Z",
              eventType: "specialist_visit",
              facilityId: "facility-9",
              id: "care-event-9",
              outcomeNotes: "Specialist visit completed.",
              patientId: "patient-1",
              providerName: "Dr. Neri",
              subtype: "Cardiology",
              updatedAt: "2026-03-20T09:01:00.000Z",
            },
            document: {
              documentType: "visit_report",
              downloadUrl: "/api/v1/documents/document-9/download",
              previewUrl: "/api/v1/documents/document-9/preview",
              fileSizeBytes: 6,
              id: "document-9",
              mimeType: "application/pdf",
              notes: "Visit report.",
              originalFilename: "visit-report.pdf",
              patientId: "patient-1",
              relatedEntityId: "care-event-9",
              relatedEntityType: "care_event",
              uploadedAt: "2026-03-20T09:02:00.000Z",
              uploadedByUserId: "user-1",
            },
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
            careEvents: [
              {
                bookingId: null,
                completedAt: "2026-03-20T09:00:00.000Z",
                createdAt: "2026-03-20T09:01:00.000Z",
                eventType: "specialist_visit",
                facilityId: "facility-9",
                id: "care-event-9",
                outcomeNotes: "Specialist visit completed.",
                patientId: "patient-1",
                providerName: "Dr. Neri",
                subtype: "Cardiology",
                updatedAt: "2026-03-20T09:01:00.000Z",
              },
            ],
            pagination: {
              page: 1,
              pageSize: 20,
              total: 1,
              totalPages: 1,
            },
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
            subtypesByType: {
              exam: [],
              specialist_visit: ["Cardiology"],
              treatment: [],
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

    const result = await store.createCareEventWithRelatedData("patient-1", {
      attachedDocument: {
        documentType: "visit_report",
        file,
        notes: "Visit report.",
      },
      careEvent: {
        bookingId: null,
        completedAt: "2026-03-20T09:00:00.000Z",
        eventType: "specialist_visit",
        facilityId: null,
        outcomeNotes: "Specialist visit completed.",
        providerName: "Dr. Neri",
        subtype: "Cardiology",
      },
      facilityPayload: {
        address: "Via Milano 2",
        city: "Milan",
        facilityType: "Clinic",
        name: "Cardio Clinic",
        notes: null,
      },
    });

    expect(result.document?.id).toBe("document-9");
    expect(store.careEvents[0]?.id).toBe("care-event-9");

    const [url, init] = mockFetch.mock.calls[0] ?? [];
    expect(url).toBe(
      "/api/v1/patients/patient-1/care-events/with-related-data",
    );
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({});

    const body = init?.body as FormData;
    expect(body.get("file")).toBe(file);
    expect(body.get("documentType")).toBe("visit_report");
    expect(JSON.parse(String(body.get("careEvent")))).toMatchObject({
      eventType: "specialist_visit",
      providerName: "Dr. Neri",
    });
    expect(JSON.parse(String(body.get("facility")))).toMatchObject({
      name: "Cardio Clinic",
    });
  });

  it("loads care event subtype suggestions separately from filtered events", async () => {
    const store = useCareEventsStore();

    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          subtypesByType: {
            exam: ["Blood test", "Urine test"],
            specialist_visit: ["Cardiology"],
            treatment: ["Physical therapy"],
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

    await store.loadCareEventSubtypes("patient-1");

    expect(store.subtypesByType).toEqual({
      exam: ["Blood test", "Urine test"],
      specialist_visit: ["Cardiology"],
      treatment: ["Physical therapy"],
    });
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/v1/patients/patient-1/care-event-subtypes",
      expect.objectContaining({
        credentials: "include",
        method: "GET",
      }),
    );
  });

  it("loads patient care events with filters and pagination", async () => {
    const store = useCareEventsStore();

    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          careEvents: [],
          pagination: {
            page: 2,
            pageSize: 10,
            total: 13,
            totalPages: 2,
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

    await store.loadCareEvents("patient-1", {
      eventType: "exam",
      page: 2,
      pageSize: 10,
      search: "Rossi",
      subtype: "Blood test",
    });

    expect(store.pagination).toEqual({
      page: 2,
      pageSize: 10,
      total: 13,
      totalPages: 2,
    });
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/v1/patients/patient-1/care-events?eventType=exam&page=2&pageSize=10&search=Rossi&subtype=Blood+test",
      expect.objectContaining({
        credentials: "include",
        method: "GET",
      }),
    );
  });

  it("loads all care event pages for export", async () => {
    const store = useCareEventsStore();

    mockFetch
      .mockResolvedValueOnce(
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
                outcomeNotes: "Blood work completed.",
                patientId: "patient-1",
                providerName: "Dr. Rossi",
                subtype: "Blood test",
                updatedAt: "2026-03-18T10:05:00.000Z",
              },
            ],
            pagination: {
              page: 1,
              pageSize: 100,
              total: 2,
              totalPages: 2,
            },
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
            careEvents: [
              {
                bookingId: null,
                completedAt: "2026-03-20T10:00:00.000Z",
                createdAt: "2026-03-20T10:05:00.000Z",
                eventType: "specialist_visit",
                facilityId: null,
                id: "care-event-2",
                outcomeNotes: "Diabetology checkup completed.",
                patientId: "patient-1",
                providerName: "Dr. Verdi",
                subtype: "Diabetology",
                updatedAt: "2026-03-20T10:05:00.000Z",
              },
            ],
            pagination: {
              page: 2,
              pageSize: 100,
              total: 2,
              totalPages: 2,
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

    const careEvents = await store.loadCareEventsForExport("patient-1", {
      eventType: "specialist_visit",
    });

    expect(careEvents.map((careEvent) => careEvent.id)).toEqual([
      "care-event-2",
      "care-event-1",
    ]);
    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      "/api/v1/patients/patient-1/care-events?eventType=specialist_visit&page=1&pageSize=100",
      expect.objectContaining({
        credentials: "include",
        method: "GET",
      }),
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      "/api/v1/patients/patient-1/care-events?eventType=specialist_visit&page=2&pageSize=100",
      expect.objectContaining({
        credentials: "include",
        method: "GET",
      }),
    );
  });

  it("deletes a care event and refreshes the filtered list", async () => {
    const store = useCareEventsStore();

    mockFetch
      .mockResolvedValueOnce(
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
                updatedAt: "2026-03-18T10:05:00.000Z",
              },
            ],
            pagination: {
              page: 1,
              pageSize: 20,
              total: 1,
              totalPages: 1,
            },
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
              updatedAt: "2026-03-18T10:05:00.000Z",
            },
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
            careEvents: [],
            pagination: {
              page: 1,
              pageSize: 20,
              total: 0,
              totalPages: 0,
            },
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
            subtypesByType: {
              exam: [],
              specialist_visit: [],
              treatment: [],
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
    await store.deleteCareEvent("care-event-1");

    expect(store.careEvents).toHaveLength(0);
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      "/api/v1/care-events/care-event-1",
      {
        credentials: "include",
        headers: {},
        method: "DELETE",
      },
    );
  });
});
