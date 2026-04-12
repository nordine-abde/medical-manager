import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useMedicationsStore } from "../src/modules/medications/store";

const mockFetch = vi.fn<typeof fetch>();

describe("useMedicationsStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
  });

  it("loads patient medications with the active-only endpoint by default", async () => {
    const store = useMedicationsStore();

    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          medications: [
            {
              archived: false,
              conditionId: "condition-1",
              createdAt: "2026-03-19T00:00:00.000Z",
              deletedAt: null,
              dosage: "1 tablet after breakfast",
              id: "medication-1",
              linkedPrescriptions: [],
              name: "Metformin",
              nextGpContactDate: "2026-03-28",
              notes: "Check remaining stock before renewal.",
              patientId: "patient-1",
              prescribingDoctor: "Dr. Rossi",
              quantity: "28 tablets",
              renewalCadence: "Every 30 days",
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

    await store.loadMedications("patient-1");

    expect(store.medications).toHaveLength(1);
    expect(store.activeMedications).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/v1/patients/patient-1/medications",
      {
        credentials: "include",
        headers: {},
        method: "GET",
      },
    );
  });

  it("creates and updates medications while keeping linked prescription context", async () => {
    const store = useMedicationsStore();

    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            medications: [],
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
            medication: {
              archived: false,
              conditionId: "condition-1",
              createdAt: "2026-03-19T09:00:00.000Z",
              deletedAt: null,
              dosage: "1 tablet after breakfast",
              id: "medication-2",
              linkedPrescriptions: [],
              name: "Metformin",
              nextGpContactDate: "2026-03-28",
              notes: "Check remaining stock before renewal.",
              patientId: "patient-1",
              prescribingDoctor: "Dr. Rossi",
              quantity: "28 tablets",
              renewalCadence: "Every 30 days",
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
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            medication: {
              archived: false,
              conditionId: "condition-1",
              createdAt: "2026-03-19T09:00:00.000Z",
              deletedAt: null,
              dosage: "1 tablet after breakfast",
              id: "medication-2",
              linkedPrescriptions: [
                {
                  collectedAt: null,
                  createdAt: "2026-03-20T10:00:00.000Z",
                  deletedAt: null,
                  expirationDate: "2026-04-30",
                  id: "prescription-1",
                  issueDate: "2026-03-20",
                  patientId: "patient-1",
                  prescriptionType: "medication",
                  receivedAt: null,
                  requestedAt: "2026-03-20T10:00:00.000Z",
                  status: "requested",
                },
              ],
              name: "Metformin",
              nextGpContactDate: "2026-03-31",
              notes: "Renewal requested from GP.",
              patientId: "patient-1",
              prescribingDoctor: "Dr. Rossi",
              quantity: "21 tablets",
              renewalCadence: "Every 30 days",
              updatedAt: "2026-03-20T10:00:00.000Z",
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

    await store.loadMedications("patient-1");
    await store.createMedication("patient-1", {
      conditionId: "condition-1",
      dosage: "1 tablet after breakfast",
      name: "Metformin",
      nextGpContactDate: "2026-03-28",
      notes: "Check remaining stock before renewal.",
      prescribingDoctor: "Dr. Rossi",
      quantity: "28 tablets",
      renewalCadence: "Every 30 days",
    });

    const updatedMedication = await store.updateMedication("medication-2", {
      nextGpContactDate: "2026-03-31",
      notes: "Renewal requested from GP.",
      quantity: "21 tablets",
    });

    expect(updatedMedication.linkedPrescriptions).toHaveLength(1);
    expect(store.medications[0]?.linkedPrescriptions[0]?.status).toBe(
      "requested",
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      "/api/v1/patients/patient-1/medications",
      {
        body: JSON.stringify({
          conditionId: "condition-1",
          dosage: "1 tablet after breakfast",
          name: "Metformin",
          nextGpContactDate: "2026-03-28",
          notes: "Check remaining stock before renewal.",
          prescribingDoctor: "Dr. Rossi",
          quantity: "28 tablets",
          renewalCadence: "Every 30 days",
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
      "/api/v1/medications/medication-2",
      {
        body: JSON.stringify({
          nextGpContactDate: "2026-03-31",
          notes: "Renewal requested from GP.",
          quantity: "21 tablets",
        }),
        credentials: "include",
        headers: {
          "content-type": "application/json",
        },
        method: "PATCH",
      },
    );
  });

  it("archives medications and removes them from the default visible list", async () => {
    const store = useMedicationsStore();

    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            medications: [
              {
                archived: false,
                conditionId: null,
                createdAt: "2026-03-19T00:00:00.000Z",
                deletedAt: null,
                dosage: "Apply once daily",
                id: "medication-3",
                linkedPrescriptions: [],
                name: "Topical cream",
                nextGpContactDate: null,
                notes: null,
                patientId: "patient-1",
                prescribingDoctor: null,
                quantity: "1 tube",
                renewalCadence: null,
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
            medication: {
              archived: true,
              conditionId: null,
              createdAt: "2026-03-19T00:00:00.000Z",
              deletedAt: "2026-03-20T08:30:00.000Z",
              dosage: "Apply once daily",
              id: "medication-3",
              linkedPrescriptions: [],
              name: "Topical cream",
              nextGpContactDate: null,
              notes: null,
              patientId: "patient-1",
              prescribingDoctor: null,
              quantity: "1 tube",
              renewalCadence: null,
              updatedAt: "2026-03-20T08:30:00.000Z",
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

    await store.loadMedications("patient-1");
    await store.archiveMedication("medication-3");

    expect(store.medications).toHaveLength(0);
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      "/api/v1/medications/medication-3",
      {
        credentials: "include",
        headers: {},
        method: "DELETE",
      },
    );
  });
});
