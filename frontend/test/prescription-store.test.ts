import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { usePrescriptionsStore } from "../src/modules/prescriptions/store";

const mockFetch = vi.fn<typeof fetch>();

describe("usePrescriptionsStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
  });

  it("loads patient prescriptions with the active-only endpoint by default", async () => {
    const store = usePrescriptionsStore();

    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          prescriptions: [
            {
              collectedAt: null,
              createdAt: "2026-03-19T00:00:00.000Z",
              deletedAt: null,
              expirationDate: "2026-04-15",
              id: "prescription-1",
              issueDate: "2026-03-19",
              medicationId: null,
              notes: "Needs GP renewal before the next cycle.",
              patientId: "patient-1",
              prescriptionType: "medication",
              receivedAt: null,
              requestedAt: null,
              status: "needed",
              subtype: "Amoxicillin",
              taskId: null,
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

    await store.loadPrescriptions("patient-1");

    expect(store.prescriptions).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/v1/patients/patient-1/prescriptions",
      {
        credentials: "include",
        headers: {},
        method: "GET",
      },
    );
  });

  it("creates prescriptions and keeps matching records in the visible list", async () => {
    const store = usePrescriptionsStore();

    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            prescriptions: [],
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
            prescription: {
              collectedAt: null,
              createdAt: "2026-03-19T09:00:00.000Z",
              deletedAt: null,
              expirationDate: "2026-04-15",
              id: "prescription-2",
              issueDate: "2026-03-19",
              medicationId: null,
              notes: "Request the exam authorization.",
              patientId: "patient-1",
              prescriptionType: "exam",
              receivedAt: null,
              requestedAt: null,
              status: "needed",
              subtype: "Blood test",
              taskId: "task-1",
              updatedAt: "2026-03-19T09:00:00.000Z",
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

    await store.loadPrescriptions("patient-1");
    await store.createPrescription("patient-1", {
      expirationDate: "2026-04-15",
      issueDate: "2026-03-19",
      notes: "Request the exam authorization.",
      prescriptionType: "exam",
      status: "needed",
      subtype: "Blood test",
      taskId: "task-1",
    });

    expect(store.prescriptions).toHaveLength(1);
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      "/api/v1/patients/patient-1/prescriptions",
      {
        body: JSON.stringify({
          expirationDate: "2026-04-15",
          issueDate: "2026-03-19",
          notes: "Request the exam authorization.",
          prescriptionType: "exam",
          status: "needed",
          subtype: "Blood test",
          taskId: "task-1",
        }),
        credentials: "include",
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      },
    );
  });

  it("updates prescription details and workflow state through separate endpoints", async () => {
    const store = usePrescriptionsStore();

    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            prescriptions: [
              {
                collectedAt: null,
                createdAt: "2026-03-19T00:00:00.000Z",
                deletedAt: null,
                expirationDate: "2026-04-15",
                id: "prescription-3",
                issueDate: "2026-03-19",
                medicationId: null,
                notes: "Pick up the therapy plan.",
                patientId: "patient-1",
                prescriptionType: "therapy",
                receivedAt: null,
                requestedAt: "2026-03-19T08:00:00.000Z",
                status: "requested",
                subtype: "Physiotherapy",
                taskId: "task-3",
                updatedAt: "2026-03-19T08:00:00.000Z",
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
            prescription: {
              collectedAt: null,
              createdAt: "2026-03-19T00:00:00.000Z",
              deletedAt: null,
              expirationDate: "2026-04-20",
              id: "prescription-3",
              issueDate: "2026-03-19",
              medicationId: null,
              notes: "Pick up the updated therapy plan.",
              patientId: "patient-1",
              prescriptionType: "therapy",
              receivedAt: null,
              requestedAt: "2026-03-19T08:00:00.000Z",
              status: "requested",
              subtype: "Physiotherapy",
              taskId: "task-3",
              updatedAt: "2026-03-19T10:00:00.000Z",
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
            prescription: {
              collectedAt: null,
              createdAt: "2026-03-19T00:00:00.000Z",
              deletedAt: null,
              expirationDate: "2026-04-20",
              id: "prescription-3",
              issueDate: "2026-03-19",
              medicationId: null,
              notes: "Pick up the updated therapy plan.",
              patientId: "patient-1",
              prescriptionType: "therapy",
              receivedAt: "2026-03-20T09:30:00.000Z",
              requestedAt: "2026-03-19T08:00:00.000Z",
              status: "available",
              subtype: "Physiotherapy",
              taskId: "task-3",
              updatedAt: "2026-03-20T09:30:00.000Z",
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

    await store.loadPrescriptions("patient-1");

    const updatedPrescription = await store.updatePrescription(
      "prescription-3",
      {
        expirationDate: "2026-04-20",
        notes: "Pick up the updated therapy plan.",
        subtype: "Physiotherapy",
      },
      {
        statusPayload: {
          receivedAt: "2026-03-20T09:30:00.000Z",
          status: "available",
        },
      },
    );

    expect(updatedPrescription.status).toBe("available");
    expect(store.prescriptions[0]?.receivedAt).toBe("2026-03-20T09:30:00.000Z");
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      "/api/v1/prescriptions/prescription-3",
      {
        body: JSON.stringify({
          expirationDate: "2026-04-20",
          notes: "Pick up the updated therapy plan.",
          subtype: "Physiotherapy",
        }),
        credentials: "include",
        headers: {
          "content-type": "application/json",
        },
        method: "PATCH",
      },
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      3,
      "/api/v1/prescriptions/prescription-3/status",
      {
        body: JSON.stringify({
          receivedAt: "2026-03-20T09:30:00.000Z",
          status: "available",
        }),
        credentials: "include",
        headers: {
          "content-type": "application/json",
        },
        method: "PATCH",
      },
    );
  });
});
