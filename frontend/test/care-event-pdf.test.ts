import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import {
  buildCareEventReportsPdf,
  buildCareEventReportsPdfWithAttachments,
  type CareEventReportPdfEntry,
  sortCareEventReportPdfEntries,
} from "../src/modules/care-events/pdf";

const baseEntry: CareEventReportPdfEntry = {
  booking: "No linked booking",
  careEventId: "care-event-1",
  completedAt: "24 Mar 2026, 10:00",
  document: {
    documentType: "Visit report",
    fileSize: "128.0 KB",
    filename: "diabetes-visit.pdf",
    notes: "Previous diabetology checkup.",
    uploadedAt: "24 Mar 2026, 11:00",
  },
  eventType: "Specialist visit",
  facility: "San Luca Clinic",
  id: "care-event-1:document-1",
  notes: "Stable therapy plan.",
  provider: "Dr. Rossi",
  sortValue: "2026-03-24T10:00:00.000Z",
  subtype: "Diabetology",
  title: "Specialist visit - Diabetology",
};

const labels = {
  booking: "Booking",
  completedAt: "Completed at",
  document: "Report",
  documentCount: "Attached documents",
  documentNotes: "Report notes",
  documentType: "Document type",
  emptyDocument: "No report file is attached.",
  eventCount: "Selected events",
  eventType: "Event type",
  facility: "Facility",
  fileSize: "File size",
  filters: "Selection",
  generatedAt: "Generated at",
  indexTitle: "Reports index",
  initialSummary: "Initial summary",
  noEntries: "No care events match this selection.",
  notes: "Notes",
  page: "Page {page} of {total}",
  patient: "Patient",
  provider: "Provider",
  reportCount: "Dossier pages",
  sourceEvent: "Care event",
  subtype: "Subtype",
  uploadedAt: "Uploaded at",
};

describe("care event PDF utilities", () => {
  it("sorts oldest report entries first", () => {
    const olderEntry = {
      ...baseEntry,
      id: "care-event-2:document-2",
      sortValue: "2026-03-20T10:00:00.000Z",
      title: "Blood panel",
    };

    expect(
      sortCareEventReportPdfEntries([olderEntry, baseEntry]).map(
        (entry) => entry.id,
      ),
    ).toEqual(["care-event-2:document-2", "care-event-1:document-1"]);
  });

  it("builds a PDF blob for printable care event dossiers", async () => {
    const blob = buildCareEventReportsPdf({
      documentCount: 1,
      entries: [baseEntry],
      eventCount: 1,
      filtersSummary: ["Subtypes: Diabetology (Specialist visit)"],
      generatedAt: "24 Mar 2026, 12:00",
      labels,
      patientName: "Maria Rossi",
      title: "Clinical reports dossier",
    });

    expect(blob.type).toBe("application/pdf");
    expect(await blob.text()).toMatch(/^%PDF-/);
  });

  it("appends original PDF attachments after their matching summary page", async () => {
    const attachmentBlob = buildCareEventReportsPdf({
      documentCount: 0,
      entries: [],
      eventCount: 0,
      filtersSummary: [],
      generatedAt: "24 Mar 2026, 12:00",
      labels,
      patientName: "Maria Rossi",
      title: "Original report",
    });
    const blob = await buildCareEventReportsPdfWithAttachments({
      attachments: [
        {
          entryId: "care-event-1:document-1",
          filename: "original-report.pdf",
          url: "/api/v1/documents/document-1/download",
        },
      ],
      documentCount: 1,
      entries: [baseEntry],
      eventCount: 1,
      filtersSummary: ["Subtypes: Diabetology (Specialist visit)"],
      generatedAt: "24 Mar 2026, 12:00",
      labels,
      loadAttachment: () => attachmentBlob.arrayBuffer(),
      patientName: "Maria Rossi",
      title: "Clinical reports dossier",
    });
    const mergedDocument = await PDFDocument.load(await blob.arrayBuffer());

    expect(blob.type).toBe("application/pdf");
    expect(mergedDocument.getPageCount()).toBe(3);
  });
});
