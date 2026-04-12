import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { usePatientsStore } from "../src/modules/patients/store";

const mockFetch = vi.fn<typeof fetch>();

describe("usePatientsStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
  });

  it("loads active patients by default", async () => {
    const store = usePatientsStore();

    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          patients: [
            {
              archived: false,
              createdAt: "2026-03-19T00:00:00.000Z",
              dateOfBirth: "1958-05-11",
              deletedAt: null,
              fullName: "Maria Rossi",
              id: "patient-1",
              notes: "Needs weekly follow-up",
              updatedAt: "2026-03-19T00:00:00.000Z",
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

    await store.loadPatients();

    expect(store.patients).toHaveLength(1);
    expect(store.patients[0]?.fullName).toBe("Maria Rossi");
    expect(mockFetch).toHaveBeenCalledWith("/api/v1/patients", {
      credentials: "include",
      headers: {},
      method: "GET",
    });
  });

  it("creates a patient and keeps the list updated", async () => {
    const store = usePatientsStore();

    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            patients: [],
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
            patient: {
              archived: false,
              createdAt: "2026-03-19T00:00:00.000Z",
              dateOfBirth: "1941-11-03",
              deletedAt: null,
              fullName: "Lucia Bianchi",
              id: "patient-2",
              notes: "Diabetes monitoring",
              updatedAt: "2026-03-19T00:00:00.000Z",
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

    await store.loadPatients();
    const createdPatient = await store.createPatient({
      dateOfBirth: "1941-11-03",
      fullName: "Lucia Bianchi",
      notes: "Diabetes monitoring",
    });

    expect(createdPatient.id).toBe("patient-2");
    expect(store.patients).toHaveLength(1);
    expect(store.patients[0]?.fullName).toBe("Lucia Bianchi");
    expect(mockFetch).toHaveBeenNthCalledWith(2, "/api/v1/patients", {
      body: JSON.stringify({
        dateOfBirth: "1941-11-03",
        fullName: "Lucia Bianchi",
        notes: "Diabetes monitoring",
      }),
      credentials: "include",
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    });
  });

  it("archives and restores a patient while includeArchived is enabled", async () => {
    const store = usePatientsStore();

    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            patients: [
              {
                archived: false,
                createdAt: "2026-03-19T00:00:00.000Z",
                dateOfBirth: null,
                deletedAt: null,
                fullName: "Anna Verdi",
                id: "patient-3",
                notes: null,
                updatedAt: "2026-03-19T00:00:00.000Z",
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
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            patient: {
              archived: true,
              createdAt: "2026-03-19T00:00:00.000Z",
              dateOfBirth: null,
              deletedAt: "2026-03-19T01:00:00.000Z",
              fullName: "Anna Verdi",
              id: "patient-3",
              notes: null,
              updatedAt: "2026-03-19T01:00:00.000Z",
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
            patient: {
              archived: false,
              createdAt: "2026-03-19T00:00:00.000Z",
              dateOfBirth: null,
              deletedAt: null,
              fullName: "Anna Verdi",
              id: "patient-3",
              notes: null,
              updatedAt: "2026-03-19T02:00:00.000Z",
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

    await store.loadPatients({
      includeArchived: true,
    });
    await store.archivePatient("patient-3");
    expect(store.patients[0]?.archived).toBe(true);

    await store.restorePatient("patient-3");
    expect(store.patients[0]?.archived).toBe(false);
    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      "/api/v1/patients?includeArchived=true",
      {
        credentials: "include",
        headers: {},
        method: "GET",
      },
    );
    expect(mockFetch).toHaveBeenNthCalledWith(2, "/api/v1/patients/patient-3", {
      credentials: "include",
      headers: {},
      method: "DELETE",
    });
    expect(mockFetch).toHaveBeenNthCalledWith(
      3,
      "/api/v1/patients/patient-3/restore",
      {
        credentials: "include",
        headers: {},
        method: "POST",
      },
    );
  });

  it("loads the aggregated patient overview", async () => {
    const store = usePatientsStore();

    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          overview: {
            activeConditions: [
              {
                id: "condition-1",
                name: "Hypertension",
                notes: "Monitor blood pressure weekly",
              },
            ],
            activeMedications: [
              {
                conditionName: "Hypertension",
                id: "medication-1",
                name: "Atorvastatin",
                nextGpContactDate: "2026-03-28",
                quantity: "30 tablets",
                renewalCadence: "Monthly",
                renewalTask: {
                  dueDate: "2026-03-26",
                  id: "task-renewal-1",
                  status: "pending",
                  title: "Renew statin",
                },
              },
            ],
            overdueTaskCount: 2,
            pendingPrescriptions: [
              {
                expirationDate: "2026-04-08",
                id: "prescription-1",
                issueDate: "2026-03-19",
                notes: "Request renewal",
                prescriptionType: "medication",
                status: "requested",
                taskId: "task-1",
              },
            ],
            upcomingAppointments: [
              {
                appointmentAt: "2026-03-21T10:30:00.000Z",
                facilityId: "facility-1",
                id: "booking-1",
                prescriptionId: null,
                status: "booked",
                taskId: "task-2",
              },
            ],
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

    await store.loadOverview("patient-99");

    expect(store.currentOverview?.overdueTaskCount).toBe(2);
    expect(store.currentOverview?.activeConditions[0]?.name).toBe(
      "Hypertension",
    );
    expect(
      store.currentOverview?.activeMedications[0]?.renewalTask?.title,
    ).toBe("Renew statin");
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/v1/patients/patient-99/overview",
      {
        credentials: "include",
        headers: {},
        method: "GET",
      },
    );
  });

  it("loads patient timeline entries with filters", async () => {
    const store = usePatientsStore();

    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          timeline: [
            {
              eventDate: "2026-03-19T09:00:00.000Z",
              id: "task:task-1",
              patientId: "patient-99",
              relatedEntity: {
                id: "task-1",
                type: "task",
              },
              summary: "Book specialist follow-up",
              type: "task",
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

    await store.loadTimeline("patient-99", {
      endDate: "2026-03-31",
      eventType: "task",
      startDate: "2026-03-01",
    });

    expect(store.currentTimeline).toHaveLength(1);
    expect(store.currentTimeline[0]?.relatedEntity.type).toBe("task");
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/v1/patients/patient-99/timeline?eventType=task&startDate=2026-03-01&endDate=2026-03-31",
      {
        credentials: "include",
        headers: {},
        method: "GET",
      },
    );
  });

  it("loads the global timeline workspace", async () => {
    const store = usePatientsStore();

    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          timeline: [
            {
              eventDate: "2026-03-21T09:00:00.000Z",
              id: "booking:booking-1",
              patient: {
                fullName: "Anna Verdi",
                id: "patient-2",
              },
              patientId: "patient-2",
              relatedEntity: {
                id: "booking-1",
                type: "booking",
              },
              summary: "MRI follow-up booked",
              type: "booking",
            },
            {
              eventDate: "2026-03-22T08:00:00.000Z",
              id: "task:task-2",
              patient: {
                fullName: "Mario Rossi",
                id: "patient-1",
              },
              patientId: "patient-1",
              relatedEntity: {
                id: "task-2",
                type: "task",
              },
              summary: "Call GP office",
              type: "task",
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

    await store.loadGlobalTimeline();

    expect(store.globalTimeline).toHaveLength(2);
    expect(store.globalTimeline[0]?.patient.fullName).toBe("Mario Rossi");
    expect(store.globalTimeline[1]?.patient.fullName).toBe("Anna Verdi");
    expect(mockFetch).toHaveBeenCalledWith("/api/v1/timeline", {
      credentials: "include",
      headers: {},
      method: "GET",
    });
  });

  it("loads, adds, and removes patient collaborators", async () => {
    const store = usePatientsStore();

    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            users: [
              {
                email: "zoe@example.com",
                fullName: "Zoe Caregiver",
                id: "user-2",
                linkedAt: "2026-03-19T09:00:00.000Z",
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
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            user: {
              email: "anna@example.com",
              fullName: "Anna Helper",
              id: "user-3",
              linkedAt: "2026-03-19T10:00:00.000Z",
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
            user: {
              email: "zoe@example.com",
              fullName: "Zoe Caregiver",
              id: "user-2",
              linkedAt: "2026-03-19T09:00:00.000Z",
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

    await store.loadPatientUsers("patient-1");
    expect(store.patientUsers).toHaveLength(1);

    await store.addPatientUser("patient-1", " anna@example.com ");
    expect(store.patientUsers).toHaveLength(2);
    expect(store.patientUsers[0]?.fullName).toBe("Anna Helper");

    await store.removePatientUser("patient-1", "user-2");
    expect(store.patientUsers).toEqual([
      {
        email: "anna@example.com",
        fullName: "Anna Helper",
        id: "user-3",
        linkedAt: "2026-03-19T10:00:00.000Z",
      },
    ]);

    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      "/api/v1/patients/patient-1/users",
      {
        credentials: "include",
        headers: {},
        method: "GET",
      },
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      "/api/v1/patients/patient-1/users",
      {
        body: JSON.stringify({
          identifier: "anna@example.com",
        }),
        credentials: "include",
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      },
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      3,
      "/api/v1/patients/patient-1/users/user-2",
      {
        credentials: "include",
        headers: {},
        method: "DELETE",
      },
    );
  });
});
