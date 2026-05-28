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
            pagination: {
              page: 1,
              pageSize: 20,
              total: 1,
              totalPages: 1,
            },
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
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            pagination: {
              page: 1,
              pageSize: 20,
              total: 1,
              totalPages: 1,
            },
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
            subtypesByType: {
              exam: ["Blood test"],
              medication: [],
              therapy: [],
              visit: [],
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

  it("loads patient prescriptions with filters and pagination", async () => {
    const store = usePrescriptionsStore();

    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          pagination: {
            page: 2,
            pageSize: 10,
            total: 13,
            totalPages: 2,
          },
          prescriptions: [],
        }),
        {
          headers: {
            "content-type": "application/json",
          },
          status: 200,
        },
      ),
    );

    await store.loadPrescriptions("patient-1", {
      from: "2026-03-01",
      page: 2,
      pageSize: 10,
      prescriptionType: "exam",
      search: "Blood",
      subtype: "Blood test",
      to: "2026-04-01",
    });

    expect(store.pagination).toEqual({
      page: 2,
      pageSize: 10,
      total: 13,
      totalPages: 2,
    });
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/v1/patients/patient-1/prescriptions?from=2026-03-01&page=2&pageSize=10&prescriptionType=exam&search=Blood&subtype=Blood+test&to=2026-04-01",
      expect.objectContaining({
        credentials: "include",
        method: "GET",
      }),
    );
  });

  it("loads prescription subtype suggestions separately from filtered prescriptions", async () => {
    const store = usePrescriptionsStore();

    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          subtypesByType: {
            exam: ["Blood test"],
            medication: ["Antibiotic"],
            therapy: ["Physiotherapy"],
            visit: ["Cardiology"],
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

    await store.loadPrescriptionSubtypes("patient-1");

    expect(store.subtypesByType).toEqual({
      exam: ["Blood test"],
      medication: ["Antibiotic"],
      therapy: ["Physiotherapy"],
      visit: ["Cardiology"],
    });
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/v1/patients/patient-1/prescription-subtypes",
      expect.objectContaining({
        credentials: "include",
        method: "GET",
      }),
    );
  });

  it("updates prescription details", async () => {
    const store = usePrescriptionsStore();

    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            pagination: {
              page: 1,
              pageSize: 20,
              total: 1,
              totalPages: 1,
            },
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
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            pagination: {
              page: 1,
              pageSize: 20,
              total: 1,
              totalPages: 1,
            },
            prescriptions: [
              {
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
            subtypesByType: {
              exam: [],
              medication: [],
              therapy: ["Physiotherapy"],
              visit: [],
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

  it("creates a prescription with a document through the composite endpoint", async () => {
    const store = usePrescriptionsStore();
    const file = new File(["prescription"], "prescription.pdf", {
      type: "application/pdf",
    });

    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            document: {
              documentType: "prescription",
              downloadUrl: "/api/v1/documents/document-1/download",
              previewUrl: "/api/v1/documents/document-1/preview",
              fileSizeBytes: 12,
              id: "document-1",
              mimeType: "application/pdf",
              notes: "Original prescription scan.",
              originalFilename: "prescription.pdf",
              patientId: "patient-1",
              relatedEntityId: "prescription-4",
              relatedEntityType: "prescription",
              uploadedAt: "2026-03-19T11:00:00.000Z",
              uploadedByUserId: "user-1",
            },
            prescription: {
              createdAt: "2026-03-19T11:00:00.000Z",
              deletedAt: null,
              expirationDate: "2026-04-15",
              id: "prescription-4",
              issueDate: "2026-03-19",
              notes: "Request the exam authorization.",
              patientId: "patient-1",
              prescriptionType: "exam",
              subtype: "Blood test",
              updatedAt: "2026-03-19T11:00:00.000Z",
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
            pagination: {
              page: 1,
              pageSize: 20,
              total: 1,
              totalPages: 1,
            },
            prescriptions: [
              {
                createdAt: "2026-03-19T11:00:00.000Z",
                deletedAt: null,
                expirationDate: "2026-04-15",
                id: "prescription-4",
                issueDate: "2026-03-19",
                notes: "Request the exam authorization.",
                patientId: "patient-1",
                prescriptionType: "exam",
                subtype: "Blood test",
                updatedAt: "2026-03-19T11:00:00.000Z",
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
            subtypesByType: {
              exam: ["Blood test"],
              medication: [],
              therapy: [],
              visit: [],
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

    const result = await store.createPrescriptionWithDocument("patient-1", {
      document: {
        file,
        notes: "Original prescription scan.",
      },
      prescription: {
        expirationDate: "2026-04-15",
        issueDate: "2026-03-19",
        notes: "Request the exam authorization.",
        prescriptionType: "exam",
        subtype: "Blood test",
      },
    });

    expect(result.document.id).toBe("document-1");
    expect(store.prescriptions[0]?.id).toBe("prescription-4");

    const [url, init] = mockFetch.mock.calls[0] ?? [];
    expect(url).toBe("/api/v1/patients/patient-1/prescriptions/with-document");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({});

    const body = init?.body as FormData;
    expect(body.get("file")).toBe(file);
    expect(body.get("prescriptionType")).toBe("exam");
    expect(body.get("documentNotes")).toBe("Original prescription scan.");
  });

  it("deletes a prescription and refreshes active lists", async () => {
    const store = usePrescriptionsStore();

    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            pagination: {
              page: 1,
              pageSize: 20,
              total: 1,
              totalPages: 1,
            },
            prescriptions: [
              {
                createdAt: "2026-03-19T00:00:00.000Z",
                deletedAt: null,
                expirationDate: null,
                id: "prescription-1",
                issueDate: "2026-03-19",
                notes: null,
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
              deletedAt: "2026-03-20T09:00:00.000Z",
              expirationDate: null,
              id: "prescription-1",
              issueDate: "2026-03-19",
              notes: null,
              patientId: "patient-1",
              prescriptionType: "exam",
              subtype: "Blood test",
              updatedAt: "2026-03-20T09:00:00.000Z",
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
            pagination: {
              page: 1,
              pageSize: 20,
              total: 0,
              totalPages: 0,
            },
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
            subtypesByType: {
              exam: [],
              medication: [],
              therapy: [],
              visit: [],
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
    await store.deletePrescription("prescription-1");

    expect(store.prescriptions).toHaveLength(0);
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      "/api/v1/prescriptions/prescription-1",
      {
        credentials: "include",
        headers: {},
        method: "DELETE",
      },
    );
  });
});
