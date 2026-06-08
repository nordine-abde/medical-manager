import { describe, expect, it } from "vitest";

import {
  type BookingCalendarPdfEntry,
  buildBookingCalendarPdf,
  sortBookingCalendarPdfEntries,
} from "../src/modules/bookings/pdf";

const baseEntry: BookingCalendarPdfEntry = {
  appointmentAt: "24 Mar 2026, 10:00",
  archived: false,
  bookedAt: "20 Mar 2026, 11:00",
  calendarDateLabel: "24 Mar 2026",
  facility: "San Luca Clinic",
  id: "booking-1",
  notes: "Neurology follow-up.",
  prescription: "Visit",
  sortValue: "2026-03-24T10:00:00.000Z",
  title: "Neurology follow-up",
  visitType: "Visit - Neurology",
};

describe("booking PDF utilities", () => {
  it("sorts dated bookings before unscheduled bookings", () => {
    const unscheduledEntry = {
      ...baseEntry,
      calendarDateLabel: "No date",
      id: "booking-2",
      sortValue: "",
      title: "Unscheduled review",
    };

    expect(
      sortBookingCalendarPdfEntries([unscheduledEntry, baseEntry]).map(
        (entry) => entry.id,
      ),
    ).toEqual(["booking-1", "booking-2"]);
  });

  it("builds a PDF blob for printable booking calendars", async () => {
    const blob = buildBookingCalendarPdf({
      entries: [baseEntry],
      generatedAt: "24 Mar 2026, 12:00",
      labels: {
        appointmentAt: "Appointment time",
        archived: "Archived",
        bookedAt: "Booked at",
        bookingCount: "1 booking in the list",
        facility: "Facility",
        generatedAt: "Generated at",
        noBookings: "No bookings available.",
        notes: "Notes",
        page: "Page {page} of {total}",
        patient: "Patient",
        prescription: "Linked prescription",
        visitType: "Visit type",
      },
      patientName: "Maria Rossi",
      title: "Booking calendar",
    });

    expect(blob.type).toBe("application/pdf");
    expect(await blob.text()).toMatch(/^%PDF-/);
  });
});
