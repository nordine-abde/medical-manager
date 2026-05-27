import type { BookingRecord, FacilityRecord } from "./types";

export const formatBookingDisplayLabel = (
  booking: BookingRecord,
  options: {
    d: (value: Date | number, format?: string) => string;
    facilities: FacilityRecord[];
    t: (key: string, params?: Record<string, unknown>) => string;
  },
): string => {
  const { d, facilities, t } = options;
  const bookingDate = booking.appointmentAt ?? booking.bookedAt;
  const dateLabel = bookingDate
    ? t(
        booking.appointmentAt
          ? "bookings.labels.appointment"
          : "bookings.labels.booked",
        { date: d(new Date(bookingDate), "short") },
      )
    : t("bookings.emptyDate");
  const facility = facilities.find((item) => item.id === booking.facilityId);
  const facilityLabel = facility
    ? [facility.name, facility.city].filter(Boolean).join(" · ")
    : booking.facilityId
      ? t("bookings.missingFacility")
      : null;
  const statusLabel = t(`bookings.statuses.${booking.status}`);

  return [dateLabel, facilityLabel, statusLabel].filter(Boolean).join(" — ");
};
