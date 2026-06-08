import { jsPDF } from "jspdf";

export interface BookingCalendarPdfEntry {
  appointmentAt: string;
  archived: boolean;
  bookedAt: string;
  calendarDateLabel: string;
  facility: string;
  id: string;
  notes: string;
  prescription: string;
  sortValue: string;
  title: string;
  visitType: string;
}

export interface BookingCalendarPdfLabels {
  appointmentAt: string;
  archived: string;
  bookedAt: string;
  bookingCount: string;
  facility: string;
  generatedAt: string;
  noBookings: string;
  notes: string;
  page: string;
  patient: string;
  prescription: string;
  visitType: string;
}

export interface BuildBookingCalendarPdfInput {
  entries: BookingCalendarPdfEntry[];
  generatedAt: string;
  labels: BookingCalendarPdfLabels;
  patientName: string | null;
  title: string;
}

const normalizePdfText = (value: string): string =>
  value.replace(/\s+/g, " ").trim();

export const sortBookingCalendarPdfEntries = (
  entries: BookingCalendarPdfEntry[],
): BookingCalendarPdfEntry[] =>
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

    return left.title.localeCompare(right.title);
  });

export const buildBookingCalendarPdf = ({
  entries,
  generatedAt,
  labels,
  patientName,
  title,
}: BuildBookingCalendarPdfInput): Blob => {
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

  const addPageHeader = () => {
    doc.setFillColor(40, 83, 107);
    doc.rect(0, 0, pageWidth, 88, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text(normalizePdfText(title), margin, 36);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);

    const subtitle = [
      patientName ? `${labels.patient}: ${patientName}` : null,
      `${labels.generatedAt}: ${generatedAt}`,
      labels.bookingCount,
    ]
      .filter(Boolean)
      .join("   ");

    doc.text(normalizePdfText(subtitle), margin, 58, {
      maxWidth: contentWidth,
    });

    doc.setTextColor(20, 50, 63);
    y = 116;
  };

  const addPage = () => {
    doc.addPage();
    addPageHeader();
  };

  const ensureSpace = (height: number) => {
    if (y + height <= bottomY) {
      return;
    }

    addPage();
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
    doc.setFont("helvetica", options.style ?? "normal");
    doc.setFontSize(options.fontSize);
    doc.setTextColor(...color);

    const lines = doc.splitTextToSize(
      normalizePdfText(text),
      contentWidth - indent,
    ) as string[];

    for (const line of lines) {
      ensureSpace(options.lineHeight);
      doc.text(line, margin + indent, y);
      y += options.lineHeight;
    }
  };

  const sortedEntries = sortBookingCalendarPdfEntries(entries);

  addPageHeader();

  if (sortedEntries.length === 0) {
    writeWrappedText(labels.noBookings, {
      fontSize: 12,
      lineHeight: 16,
    });
  }

  let currentDateLabel = "";

  for (const entry of sortedEntries) {
    if (entry.calendarDateLabel !== currentDateLabel) {
      ensureSpace(34);
      currentDateLabel = entry.calendarDateLabel;
      doc.setFillColor(232, 244, 249);
      doc.roundedRect(margin, y - 17, contentWidth, 24, 4, 4, "F");
      writeWrappedText(currentDateLabel, {
        color: [40, 83, 107],
        fontSize: 11,
        lineHeight: 17,
        indent: 8,
        style: "bold",
      });
      y += 8;
    }

    ensureSpace(90);
    doc.setDrawColor(197, 211, 205);
    doc.line(margin, y - 6, pageWidth - margin, y - 6);

    writeWrappedText(
      entry.archived ? `${entry.title} (${labels.archived})` : entry.title,
      {
        fontSize: 12,
        lineHeight: 15,
        style: "bold",
      },
    );

    const details = [
      [labels.appointmentAt, entry.appointmentAt],
      [labels.bookedAt, entry.bookedAt],
      [labels.visitType, entry.visitType],
      [labels.facility, entry.facility],
      [labels.prescription, entry.prescription],
      [labels.notes, entry.notes],
    ];

    for (const [label, value] of details) {
      writeWrappedText(`${label}: ${value}`, {
        color: [50, 80, 93],
        fontSize: 9,
        indent: 12,
        lineHeight: 12,
      });
    }

    y += 12;
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
