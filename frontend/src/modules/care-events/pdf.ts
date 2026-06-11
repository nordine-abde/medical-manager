import { jsPDF } from "jspdf";
import { PDFDocument } from "pdf-lib";

export interface CareEventReportPdfDocument {
  documentType: string;
  fileSize: string;
  filename: string;
  notes: string;
  uploadedAt: string;
}

export interface CareEventReportPdfEntry {
  booking: string;
  careEventId: string;
  completedAt: string;
  document: CareEventReportPdfDocument | null;
  eventType: string;
  facility: string;
  id: string;
  notes: string;
  provider: string;
  sortValue: string;
  subtype: string;
  title: string;
}

export interface CareEventReportPdfLabels {
  booking: string;
  completedAt: string;
  document: string;
  documentCount: string;
  documentNotes: string;
  documentType: string;
  emptyDocument: string;
  eventCount: string;
  eventType: string;
  facility: string;
  fileSize: string;
  filters: string;
  generatedAt: string;
  indexTitle: string;
  initialSummary: string;
  notes: string;
  noEntries: string;
  page: string;
  patient: string;
  provider: string;
  reportCount: string;
  sourceEvent: string;
  subtype: string;
  uploadedAt: string;
}

export interface BuildCareEventReportsPdfInput {
  documentCount: number;
  entries: CareEventReportPdfEntry[];
  eventCount: number;
  entryIndexOffset?: number;
  entryTotal?: number;
  filtersSummary: string[];
  generatedAt: string;
  labels: CareEventReportPdfLabels;
  patientName: string | null;
  renderMode?: "entriesOnly" | "full" | "overviewOnly";
  title: string;
}

export interface CareEventReportPdfAttachment {
  entryId: string;
  filename: string;
  url: string;
}

export interface BuildCareEventReportsPdfWithAttachmentsInput
  extends BuildCareEventReportsPdfInput {
  attachments: CareEventReportPdfAttachment[];
  loadAttachment: (
    attachment: CareEventReportPdfAttachment,
  ) => Promise<ArrayBuffer | Uint8Array>;
}

const normalizePdfText = (value: string): string =>
  value.replace(/\s+/g, " ").trim();

export const sortCareEventReportPdfEntries = (
  entries: CareEventReportPdfEntry[],
): CareEventReportPdfEntry[] =>
  [...entries].sort((left, right) => {
    if (left.sortValue && !right.sortValue) {
      return -1;
    }

    if (!left.sortValue && right.sortValue) {
      return 1;
    }

    const dateOrder = left.sortValue.localeCompare(right.sortValue);

    if (dateOrder !== 0) {
      return dateOrder;
    }

    const titleOrder = left.title.localeCompare(right.title);

    if (titleOrder !== 0) {
      return titleOrder;
    }

    return (left.document?.filename ?? "").localeCompare(
      right.document?.filename ?? "",
    );
  });

export const buildCareEventReportsPdf = ({
  documentCount,
  entries,
  eventCount,
  entryIndexOffset = 0,
  entryTotal,
  filtersSummary,
  generatedAt,
  labels,
  patientName,
  renderMode = "full",
  title,
}: BuildCareEventReportsPdfInput): Blob => {
  const doc = new jsPDF({
    format: "a4",
    orientation: "portrait",
    unit: "pt",
  });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 42;
  const contentWidth = pageWidth - margin * 2;
  const bottomY = pageHeight - 56;
  let y = margin;
  let activeSubtitle = labels.initialSummary;

  const addPageHeader = (subtitle: string) => {
    activeSubtitle = subtitle;
    doc.setFillColor(40, 83, 107);
    doc.rect(0, 0, pageWidth, 88, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text(normalizePdfText(title), margin, 36);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(normalizePdfText(subtitle), margin, 58, {
      maxWidth: contentWidth,
    });
    doc.setTextColor(20, 50, 63);
    y = 116;
  };

  const addPage = (subtitle: string) => {
    doc.addPage();
    addPageHeader(subtitle);
  };

  const ensureSpace = (height: number) => {
    if (y + height <= bottomY) {
      return;
    }

    addPage(activeSubtitle);
  };

  const writeWrappedText = (
    text: string,
    options: {
      color?: [number, number, number];
      fontSize: number;
      indent?: number;
      lineHeight: number;
      style?: "bold" | "normal";
    },
  ) => {
    const indent = options.indent ?? 0;
    const color = options.color ?? [20, 50, 63];
    const style = options.style ?? "normal";

    doc.setFont("helvetica", style);
    doc.setFontSize(options.fontSize);
    const lines = doc.splitTextToSize(
      normalizePdfText(text) || " ",
      contentWidth - indent,
    ) as string[];
    const blockHeight = lines.length * options.lineHeight;

    if (blockHeight <= bottomY - 116) {
      ensureSpace(blockHeight);
    }

    for (const line of lines) {
      if (blockHeight > bottomY - 116) {
        ensureSpace(options.lineHeight);
      }

      doc.setFont("helvetica", style);
      doc.setFontSize(options.fontSize);
      doc.setTextColor(...color);
      doc.text(line, margin + indent, y);
      y += options.lineHeight;
    }
  };

  const writeSectionTitle = (text: string) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    const lines = doc.splitTextToSize(
      normalizePdfText(text) || " ",
      contentWidth - 16,
    ) as string[];
    const lineHeight = 14;
    const blockHeight = Math.max(24, lines.length * lineHeight + 10);

    ensureSpace(blockHeight + 8);
    y += 4;
    doc.setFillColor(232, 244, 249);
    doc.roundedRect(margin, y - 17, contentWidth, blockHeight, 4, 4, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(40, 83, 107);

    for (const line of lines) {
      doc.text(line, margin + 8, y);
      y += lineHeight;
    }

    y += 8;
  };

  const writeField = (label: string, value: string) => {
    writeWrappedText(`${label}: ${value}`, {
      color: [50, 80, 93],
      fontSize: 9,
      indent: 12,
      lineHeight: 12,
    });
  };

  const sortedEntries = sortCareEventReportPdfEntries(entries);
  const resolvedEntryTotal = entryTotal ?? sortedEntries.length;
  const shouldRenderOverview = renderMode !== "entriesOnly";
  const shouldRenderEntryPages = renderMode !== "overviewOnly";

  const writeEntryPage = (
    entry: CareEventReportPdfEntry,
    index: number,
    total: number,
    shouldAddPage: boolean,
  ) => {
    const subtitle = `${labels.document} ${index}/${total}`;

    if (shouldAddPage) {
      addPage(subtitle);
    } else {
      addPageHeader(subtitle);
    }

    writeWrappedText(entry.document?.filename ?? entry.title, {
      fontSize: 16,
      lineHeight: 20,
      style: "bold",
    });
    y += 6;

    writeSectionTitle(labels.sourceEvent);
    writeField(labels.completedAt, entry.completedAt);
    writeField(labels.eventType, entry.eventType);
    writeField(labels.subtype, entry.subtype);
    writeField(labels.provider, entry.provider);
    writeField(labels.facility, entry.facility);
    writeField(labels.booking, entry.booking);
    writeField(labels.notes, entry.notes);

    writeSectionTitle(labels.document);

    if (entry.document) {
      writeField(labels.document, entry.document.filename);
      writeField(labels.documentType, entry.document.documentType);
      writeField(labels.uploadedAt, entry.document.uploadedAt);
      writeField(labels.fileSize, entry.document.fileSize);
      writeField(labels.documentNotes, entry.document.notes);
    } else {
      writeWrappedText(labels.emptyDocument, {
        color: [50, 80, 93],
        fontSize: 10,
        indent: 12,
        lineHeight: 14,
      });
    }
  };

  if (shouldRenderOverview) {
    addPageHeader(labels.initialSummary);
    writeSectionTitle(labels.initialSummary);
    writeField(labels.patient, patientName ?? labels.patient);
    writeField(labels.generatedAt, generatedAt);
    writeField(labels.reportCount, String(sortedEntries.length));
    writeField(labels.eventCount, String(eventCount));
    writeField(labels.documentCount, String(documentCount));

    writeSectionTitle(labels.filters);

    if (filtersSummary.length === 0) {
      writeWrappedText("-", {
        color: [50, 80, 93],
        fontSize: 9,
        indent: 12,
        lineHeight: 12,
      });
    } else {
      for (const filter of filtersSummary) {
        writeWrappedText(filter, {
          color: [50, 80, 93],
          fontSize: 9,
          indent: 12,
          lineHeight: 12,
        });
      }
    }

    writeSectionTitle(labels.indexTitle);

    if (sortedEntries.length === 0) {
      writeWrappedText(labels.noEntries, {
        fontSize: 11,
        lineHeight: 15,
      });
    }

    sortedEntries.forEach((entry, index) => {
      writeWrappedText(
        `${index + 1}. ${entry.completedAt} - ${entry.title}${
          entry.document ? ` - ${entry.document.filename}` : ""
        }`,
        {
          color: [50, 80, 93],
          fontSize: 9,
          indent: 12,
          lineHeight: 12,
        },
      );
    });
  }

  if (shouldRenderEntryPages) {
    sortedEntries.forEach((entry, index) => {
      const entryIndex = entryIndexOffset + index + 1;

      writeEntryPage(
        entry,
        entryIndex,
        resolvedEntryTotal,
        shouldRenderOverview || index > 0,
      );
    });
  }

  const pageCount = doc.getNumberOfPages();

  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(89, 111, 121);
    doc.text(
      labels.page
        .replace("{page}", String(page))
        .replace("{total}", String(pageCount)),
      pageWidth - margin,
      pageHeight - 24,
      { align: "right" },
    );
  }

  const arrayBuffer = doc.output("arraybuffer");

  return new Blob([arrayBuffer], { type: "application/pdf" });
};

const appendPdfBytes = async (
  targetDocument: PDFDocument,
  pdfBytes: ArrayBuffer | Uint8Array,
  filename: string,
) => {
  try {
    const sourceDocument = await PDFDocument.load(pdfBytes, {
      ignoreEncryption: true,
    });
    const sourcePages = await targetDocument.copyPages(
      sourceDocument,
      sourceDocument.getPageIndices(),
    );

    for (const page of sourcePages) {
      targetDocument.addPage(page);
    }
  } catch {
    throw new Error(`Unable to append original PDF "${filename}".`);
  }
};

export const buildCareEventReportsPdfWithAttachments = async ({
  attachments,
  loadAttachment,
  ...input
}: BuildCareEventReportsPdfWithAttachmentsInput): Promise<Blob> => {
  const sortedEntries = sortCareEventReportPdfEntries(input.entries);

  if (attachments.length === 0) {
    return buildCareEventReportsPdf({
      ...input,
      entries: sortedEntries,
    });
  }

  const targetDocument = await PDFDocument.create();
  const attachmentsByEntryId = new Map(
    attachments.map((attachment) => [attachment.entryId, attachment]),
  );
  const overviewBlob = buildCareEventReportsPdf({
    ...input,
    entries: sortedEntries,
    renderMode: "overviewOnly",
  });

  await appendPdfBytes(
    targetDocument,
    await overviewBlob.arrayBuffer(),
    input.title,
  );

  for (const [index, entry] of sortedEntries.entries()) {
    const entryBlob = buildCareEventReportsPdf({
      ...input,
      entries: [entry],
      entryIndexOffset: index,
      entryTotal: sortedEntries.length,
      renderMode: "entriesOnly",
    });
    const attachment = attachmentsByEntryId.get(entry.id);

    await appendPdfBytes(
      targetDocument,
      await entryBlob.arrayBuffer(),
      entry.document?.filename ?? entry.title,
    );

    if (attachment) {
      await appendPdfBytes(
        targetDocument,
        await loadAttachment(attachment),
        attachment.filename,
      );
    }
  }

  const mergedBytes = await targetDocument.save();
  const mergedArrayBuffer = new ArrayBuffer(mergedBytes.byteLength);
  new Uint8Array(mergedArrayBuffer).set(mergedBytes);

  return new Blob([mergedArrayBuffer], { type: "application/pdf" });
};
