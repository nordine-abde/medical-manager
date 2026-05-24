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

    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            prescriptions: [
              {
                createdAt: "2026-03-19T00:00:00.000Z",
                deletedAt: null,
                expirationDate: "2026-04-15",
                id: "prescription-1",
                issueDate: "2026-03-19",
                notes: "Request the exam authorization.",
                patientId: "patient-1",
                prescriptionType: "exam",
                subtype: "Blood test",
                updatedAt: "2026-03-19T09:00:00.000Z",
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
              createdAt: "2026-03-19T00:00:00.000Z",
              deletedAt: null,
              expirationDate: "2026-04-15",
              id: "prescription-1",
              issueDate: "2026-03-19",
              notes: "Request the exam authorization.",
              patientId: "patient-1",
              prescriptionType: "exam",
              subtype: "Blood test",
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
      subtype: "Blood test",
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
          subtype: "Blood test",
        }),
        credentials: "include",
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      },
    );
  });

  it("updates prescription details", async () => {
    const store = usePrescriptionsStore();

    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            prescriptions: [
              {
                createdAt: "2026-03-19T00:00:00.000Z",
                deletedAt: null,
                expirationDate: "2026-04-15",
                id: "prescription-3",
                issueDate: "2026-03-19",
                notes: "Pick up the therapy plan.",
                patientId: "patient-1",
                prescriptionType: "therapy",
                subtype: "Physiotherapy",
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
              createdAt: "2026-03-19T00:00:00.000Z",
              deletedAt: null,
              expirationDate: "2026-04-20",
              id: "prescription-3",
              issueDate: "2026-03-19",
              notes: "Pick up the updated therapy plan.",
              patientId: "patient-1",
              prescriptionType: "therapy",
              subtype: "Physiotherapy",
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
      );

    await store.loadPrescriptions("patient-1");

    const updatedPrescription = await store.updatePrescription(
      "prescription-3",
      {
        expirationDate: "2026-04-20",
        notes: "Pick up the updated therapy plan.",
        subtype: "Physiotherapy",
      },
    );

    expect(updatedPrescription.expirationDate).toBe("2026-04-20");
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
  });
});
