import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useDocumentsStore } from "../src/modules/documents/store";

const mockFetch = vi.fn<typeof fetch>();

describe("useDocumentsStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
  });

  it("loads patient documents newest first", async () => {
    const store = useDocumentsStore();

    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          documents: [
            {
              documentType: "general_attachment",
              downloadUrl: "/api/v1/documents/document-1/download",
              fileSizeBytes: 512000,
              id: "document-1",
              mimeType: "application/pdf",
              notes: "Older upload",
              originalFilename: "older.pdf",
              patientId: "patient-1",
              relatedEntityId: "patient-1",
              relatedEntityType: "patient",
              uploadedAt: "2026-03-18T09:00:00.000Z",
              uploadedByUserId: "user-1",
            },
            {
              documentType: "visit_report",
              downloadUrl: "/api/v1/documents/document-2/download",
              fileSizeBytes: 128000,
              id: "document-2",
              mimeType: "image/png",
              notes: null,
              originalFilename: "recent.png",
              patientId: "patient-1",
              relatedEntityId: "booking-1",
              relatedEntityType: "booking",
              uploadedAt: "2026-03-19T09:30:00.000Z",
              uploadedByUserId: "user-1",
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

    await store.loadDocuments("patient-1");

    expect(store.documents.map((document) => document.id)).toEqual([
      "document-2",
      "document-1",
    ]);
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/v1/patients/patient-1/documents",
      {
        credentials: "include",
        method: "GET",
      },
    );
  });

  it("uploads a patient document and keeps the list updated", async () => {
    const store = useDocumentsStore();
    const file = new File(["pdf"], "report.pdf", {
      type: "application/pdf",
    });

    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            documents: [],
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
            document: {
              documentType: "exam_result",
              downloadUrl: "/api/v1/documents/document-3/download",
              fileSizeBytes: 3,
              id: "document-3",
              mimeType: "application/pdf",
              notes: "Blood test panel",
              originalFilename: "report.pdf",
              patientId: "patient-1",
              relatedEntityId: "instruction-1",
              relatedEntityType: "medical_instruction",
              uploadedAt: "2026-03-19T12:00:00.000Z",
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
      );

    await store.loadDocuments("patient-1");
    const createdDocument = await store.uploadDocument("patient-1", {
      documentType: "exam_result",
      file,
      notes: "Blood test panel",
      relatedEntityId: "instruction-1",
      relatedEntityType: "medical_instruction",
    });

    expect(createdDocument.id).toBe("document-3");
    expect(store.documents[0]?.id).toBe("document-3");

    const uploadCall = mockFetch.mock.calls[1];
    expect(uploadCall?.[0]).toBe("/api/v1/patients/patient-1/documents");
    expect(uploadCall?.[1]?.credentials).toBe("include");
    expect(uploadCall?.[1]?.method).toBe("POST");
    expect(uploadCall?.[1]?.body).toBeInstanceOf(FormData);

    const formData = uploadCall?.[1]?.body as FormData;
    expect(formData.get("documentType")).toBe("exam_result");
    expect(formData.get("relatedEntityType")).toBe("medical_instruction");
    expect(formData.get("relatedEntityId")).toBe("instruction-1");
    expect(formData.get("notes")).toBe("Blood test panel");
    expect(formData.get("file")).toBe(file);
  });
});
