import { describe, expect, it } from "vitest";

import type { DocumentRecord } from "../src/modules/documents/types";
import { filterDocumentsByRelatedEntity } from "../src/modules/documents/utils";

const documents: DocumentRecord[] = [
  {
    documentType: "general_attachment",
    downloadUrl: "/api/v1/documents/document-1/download",
    fileSizeBytes: 8,
    id: "document-1",
    mimeType: "application/pdf",
    notes: null,
    originalFilename: "instruction.pdf",
    patientId: "patient-1",
    relatedEntityId: "instruction-1",
    relatedEntityType: "medical_instruction",
    uploadedAt: "2026-03-19T09:00:00.000Z",
    uploadedByUserId: "user-1",
  },
  {
    documentType: "prescription",
    downloadUrl: "/api/v1/documents/document-2/download",
    fileSizeBytes: 8,
    id: "document-2",
    mimeType: "application/pdf",
    notes: null,
    originalFilename: "prescription.pdf",
    patientId: "patient-1",
    relatedEntityId: "prescription-1",
    relatedEntityType: "prescription",
    uploadedAt: "2026-03-19T10:00:00.000Z",
    uploadedByUserId: "user-1",
  },
  {
    documentType: "visit_report",
    downloadUrl: "/api/v1/documents/document-3/download",
    fileSizeBytes: 8,
    id: "document-3",
    mimeType: "application/pdf",
    notes: null,
    originalFilename: "booking.pdf",
    patientId: "patient-1",
    relatedEntityId: "booking-1",
    relatedEntityType: "booking",
    uploadedAt: "2026-03-19T11:00:00.000Z",
    uploadedByUserId: "user-1",
  },
];

describe("filterDocumentsByRelatedEntity", () => {
  it("returns only documents linked to the requested entity", () => {
    expect(
      filterDocumentsByRelatedEntity(
        documents,
        "medical_instruction",
        "instruction-1",
      ).map((document) => document.id),
    ).toEqual(["document-1"]);

    expect(
      filterDocumentsByRelatedEntity(
        documents,
        "prescription",
        "prescription-1",
      ).map((document) => document.id),
    ).toEqual(["document-2"]);

    expect(
      filterDocumentsByRelatedEntity(documents, "booking", "booking-1").map(
        (document) => document.id,
      ),
    ).toEqual(["document-3"]);
  });

  it("returns an empty list when the related id is missing", () => {
    expect(filterDocumentsByRelatedEntity(documents, "booking", null)).toEqual(
      [],
    );
  });
});
