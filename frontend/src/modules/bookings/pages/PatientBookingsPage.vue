<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";

import { useDocumentsStore } from "../../documents/store";
import { filterDocumentsByRelatedEntity } from "../../documents/utils";
import RelatedDocumentsPanel from "../../documents/components/RelatedDocumentsPanel.vue";
import { usePrescriptionsStore } from "../../prescriptions/store";
import { formatPrescriptionDisplayLabel } from "../../prescriptions/utils";
import BookingFormDialog from "../components/BookingFormDialog.vue";
import { useBookingsStore } from "../store";
import type {
  BookingRecord,
  BookingStatus,
  BookingUpsertPayload,
  FacilityUpsertPayload,
} from "../types";

const bookingsStore = useBookingsStore();
const prescriptionsStore = usePrescriptionsStore();
const documentsStore = useDocumentsStore();
const route = useRoute();
const router = useRouter();
const { d, t } = useI18n();

const errorMessage = ref("");
const isLoading = ref(false);
const isBookingSaving = ref(false);
const isBookingFormOpen = ref(false);
const editingBooking = ref<BookingRecord | null>(null);

const patientId = computed(() => route.params.patientId as string);
const bookings = computed(() => bookingsStore.activeBookings);
const prescriptions = computed(() => prescriptionsStore.prescriptions);
const facilities = computed(() => bookingsStore.facilities);
const documents = computed(() => documentsStore.documents);
const nowDateTime = computed(() => new Date().toISOString());

const upcomingBookings = computed(() =>
  bookings.value.filter((booking) => {
    if (booking.status === "completed" || booking.status === "cancelled") {
      return false;
    }

    if (booking.appointmentAt) {
      return booking.appointmentAt >= nowDateTime.value;
    }

    return true;
  }),
);

const bookingPrescriptionOptions = computed(() => [
  {
    label: t("bookings.unlinkedPrescription"),
    value: null,
  },
  ...prescriptions.value.map((prescription) => ({
    label: formatPrescriptionDisplayLabel(prescription, { d, t }),
    value: prescription.id,
  })),
]);

const facilityOptions = computed(() =>
  facilities.value.map((facility) => ({
    label: [facility.name, facility.city].filter(Boolean).join(" · "),
    value: facility.id,
  })),
);

const loadPage = async () => {
  isLoading.value = true;

  try {
    await Promise.all([
      bookingsStore.loadBookings(patientId.value),
      bookingsStore.loadFacilities(),
      prescriptionsStore.loadPrescriptions(patientId.value),
      documentsStore.loadDocuments(patientId.value),
    ]);
  } finally {
    isLoading.value = false;
  }
};

watch(patientId, loadPage);

onMounted(loadPage);

const formatBookingDateTime = (value: string | null) => {
  if (!value) {
    return t("bookings.emptyDate");
  }

  return d(new Date(value), "short");
};

const resolveBookingFacilityLabel = (facilityId: string | null) => {
  if (!facilityId) {
    return t("bookings.unlinkedFacility");
  }

  const facility = facilities.value.find((item) => item.id === facilityId);

  if (!facility) {
    return t("bookings.missingFacility");
  }

  return [facility.name, facility.city].filter(Boolean).join(" · ");
};

const resolveBookingPrescriptionLabel = (prescriptionId: string | null) => {
  if (!prescriptionId) {
    return t("bookings.unlinkedPrescription");
  }

  const prescription = prescriptions.value.find(
    (item) => item.id === prescriptionId,
  );

  if (!prescription) {
    return t("bookings.missingPrescription");
  }

  return formatPrescriptionDisplayLabel(prescription, { d, t });
};

const resolveBookingTitle = (booking: BookingRecord): string => {
  const dateLabel = formatBookingDateTime(
    booking.appointmentAt ?? booking.bookedAt,
  );
  const facilityLabel = resolveBookingFacilityLabel(booking.facilityId);
  const statusLabel = t(`bookings.statuses.${booking.status}`);

  const parts: string[] = [];
  if (dateLabel && dateLabel !== t("bookings.emptyDate")) {
    parts.push(dateLabel);
  }
  if (facilityLabel && facilityLabel !== t("bookings.unlinkedFacility")) {
    parts.push(facilityLabel);
  }
  if (parts.length === 0) {
    parts.push(t("bookings.title"));
  }
  parts.push(`(${statusLabel})`);

  return parts.join(" - ");
};

const nextBookingStatus = (
  status: BookingStatus,
): BookingStatus | null => {
  switch (status) {
    case "not_booked":
      return "booking_in_progress";
    case "booking_in_progress":
      return "booked";
    case "booked":
      return "completed";
    default:
      return null;
  }
};

const getBookingDocuments = (bookingId: string) =>
  filterDocumentsByRelatedEntity(documents.value, "booking", bookingId);

const openCreateBookingDialog = () => {
  editingBooking.value = null;
  isBookingFormOpen.value = true;
};

const openEditBookingDialog = (booking: BookingRecord) => {
  editingBooking.value = booking;
  isBookingFormOpen.value = true;
};

const handleBookingSubmit = async (
  payload: BookingUpsertPayload,
  statusPayload: {
    appointmentAt?: string | null;
    bookedAt?: string | null;
    status: BookingStatus;
  },
  facilityPayload: FacilityUpsertPayload | null,
) => {
  isBookingSaving.value = true;

  errorMessage.value = "";

  try {
    let facilityId = payload.facilityId;

    if (facilityPayload) {
      const createdFacility = await bookingsStore.createFacility(facilityPayload);
      facilityId = createdFacility.id;
    }

    const bookingPayload: BookingUpsertPayload = {
      ...payload,
      facilityId,
    };

    if (editingBooking.value) {
      await bookingsStore.updateBooking(
        editingBooking.value.id,
        {
          appointmentAt: bookingPayload.appointmentAt,
          bookedAt: bookingPayload.bookedAt,
          facilityId: bookingPayload.facilityId,
          notes: bookingPayload.notes,
          prescriptionId: bookingPayload.prescriptionId,
        },
        {
          statusPayload,
        },
      );
    } else {
      const createdBooking = await bookingsStore.createBooking(
        patientId.value,
        bookingPayload,
      );

      if (statusPayload.status !== createdBooking.status) {
        await bookingsStore.changeBookingStatus(
          createdBooking.id,
          statusPayload.status,
        );
      }
    }

    isBookingFormOpen.value = false;
    editingBooking.value = null;
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : t("bookings.genericError");
  } finally {
    isBookingSaving.value = false;
  }
};

const handleBookingDialogModelChange = (value: boolean) => {
  isBookingFormOpen.value = value;

  if (!value) {
    editingBooking.value = null;
  }
};

const handleAdvanceBookingStatus = async (
  bookingId: string,
  status: BookingStatus,
) => {
  isBookingSaving.value = true;

  try {
    await bookingsStore.changeBookingStatus(bookingId, status);
  } finally {
    isBookingSaving.value = false;
  }
};
</script>

<template>
  <q-page class="patient-bookings-page">
    <q-banner
      v-if="errorMessage"
      dense
      rounded
      class="patient-bookings-page__banner bg-negative text-white"
    >
      {{ errorMessage }}
    </q-banner>

    <q-card
      flat
      bordered
      class="patient-bookings-page__hero"
    >
      <q-card-section
        v-if="isLoading"
        class="patient-bookings-page__loading"
      >
        <q-spinner color="primary" size="2rem" />
      </q-card-section>

      <q-card-section v-else>
        <div class="patient-bookings-page__header">
          <div>
            <p class="patient-bookings-page__eyebrow">
              {{ $t("bookings.eyebrow") }}
            </p>
            <h1 class="patient-bookings-page__title">
              {{ $t("bookings.title") }}
            </h1>
          </div>

          <div class="patient-bookings-page__actions">
            <q-btn
              flat
              no-caps
              icon="west"
              :label="$t('patients.backToList')"
              @click="router.push('/app/patients')"
            />
            <q-btn
              outline
              color="primary"
              no-caps
              icon="insights"
              :label="$t('nav.overview')"
              @click="router.push(`/app/patients/${patientId}/overview`)"
            />
            <q-btn
              color="primary"
              icon="add"
              unelevated
              no-caps
              :label="$t('bookings.createAction')"
              @click="openCreateBookingDialog"
            />
          </div>
        </div>

        <p class="patient-bookings-page__description">
          {{ $t("bookings.description") }}
        </p>

        <div
          v-if="bookings.length"
          class="patient-bookings-page__booking-list"
        >
          <div class="patient-bookings-page__booking-summary-row">
            <q-badge
              rounded
              color="primary"
              text-color="white"
              :label="
                $t('bookings.upcomingCount', {
                  count: upcomingBookings.length,
                })
              "
            />
          </div>

          <q-card
            v-for="booking in bookings"
            :key="booking.id"
            :id="`booking-${booking.id}`"
            flat
            class="patient-bookings-page__booking-card"
            :class="{
              'patient-bookings-page__booking-card--upcoming':
                booking.appointmentAt && booking.appointmentAt >= nowDateTime,
            }"
          >
            <div class="patient-bookings-page__booking-head">
              <div class="patient-bookings-page__booking-main">
                <div class="patient-bookings-page__booking-title-row">
                  <h3 class="patient-bookings-page__booking-title">
                    {{ resolveBookingTitle(booking) }}
                  </h3>
                  <q-badge
                    rounded
                    color="accent"
                    text-color="white"
                    :label="$t(`bookings.statuses.${booking.status}`)"
                  />
                </div>
                <p class="patient-bookings-page__booking-copy">
                  {{ booking.notes || $t("bookings.emptyNotes") }}
                </p>
                <div class="patient-bookings-page__booking-meta-grid">
                  <p class="patient-bookings-page__booking-meta">
                    <span>{{ $t("bookings.fields.appointmentAt") }}</span>
                    {{ formatBookingDateTime(booking.appointmentAt) }}
                  </p>
                  <p class="patient-bookings-page__booking-meta">
                    <span>{{ $t("bookings.fields.bookedAt") }}</span>
                    {{ formatBookingDateTime(booking.bookedAt) }}
                  </p>
                  <p class="patient-bookings-page__booking-meta">
                    <span>{{ $t("bookings.fields.facility") }}</span>
                    {{ resolveBookingFacilityLabel(booking.facilityId) }}
                  </p>
                  <p class="patient-bookings-page__booking-meta">
                    <span>{{ $t("bookings.fields.prescription") }}</span>
                    {{ resolveBookingPrescriptionLabel(booking.prescriptionId) }}
                  </p>
                </div>

                <RelatedDocumentsPanel
                  :documents="getBookingDocuments(booking.id)"
                  :empty-description="$t('bookings.linkedDocumentsEmptyDescription')"
                  :empty-title="$t('bookings.linkedDocumentsEmptyTitle')"
                  :eyebrow="$t('bookings.linkedDocumentsEyebrow')"
                  :title="$t('bookings.linkedDocumentsTitle')"
                />
              </div>

              <div class="patient-bookings-page__booking-actions">
                <q-btn
                  :key="`advance-booking-${booking.id}-${booking.status}`"
                  v-if="nextBookingStatus(booking.status)"
                  flat
                  color="accent"
                  icon="event_available"
                  no-caps
                  :loading="isBookingSaving"
                  :label="
                    $t('bookings.advanceAction', {
                      status: $t(
                        `bookings.statuses.${nextBookingStatus(booking.status)}`,
                      ),
                    })
                  "
                  @click="
                    handleAdvanceBookingStatus(
                      booking.id,
                      nextBookingStatus(booking.status) as BookingStatus,
                    )
                  "
                />
                <q-btn
                  :key="`edit-booking-${booking.id}`"
                  flat
                  color="primary"
                  icon="edit"
                  no-caps
                  :label="$t('bookings.edit')"
                  @click="openEditBookingDialog(booking)"
                />
              </div>
            </div>
          </q-card>
        </div>

        <q-card
          v-else
          flat
          class="patient-bookings-page__booking-empty"
        >
          <p class="patient-bookings-page__summary-eyebrow">
            {{ $t("bookings.emptyEyebrow") }}
          </p>
          <h3 class="patient-bookings-page__booking-empty-title">
            {{ $t("bookings.emptyTitle") }}
          </h3>
          <p class="patient-bookings-page__summary-copy">
            {{ $t("bookings.emptyDescription") }}
          </p>
        </q-card>
      </q-card-section>
    </q-card>

    <BookingFormDialog
      :booking="editingBooking"
      :facility-options="facilityOptions"
      :loading="isBookingSaving"
      :model-value="isBookingFormOpen"
      :prescription-options="bookingPrescriptionOptions"
      :submit-label="$t('bookings.save')"
      :title="editingBooking ? $t('bookings.editTitle') : $t('bookings.createTitle')"
      @submit="handleBookingSubmit"
      @update:model-value="handleBookingDialogModelChange"
    />
  </q-page>
</template>

<style scoped>
.patient-bookings-page {
  display: grid;
  gap: 1rem;
}

.patient-bookings-page__banner {
  margin-bottom: 0.5rem;
}

.patient-bookings-page__hero {
  border-radius: 1.5rem;
  background:
    linear-gradient(135deg, rgba(20, 50, 63, 0.04), transparent 40%),
    rgba(255, 255, 255, 0.94);
}

.patient-bookings-page__loading {
  display: flex;
  justify-content: center;
  padding: 3rem;
}

.patient-bookings-page__header {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 1rem;
}

.patient-bookings-page__eyebrow,
.patient-bookings-page__summary-eyebrow {
  margin: 0 0 0.4rem;
  color: #6c8f7d;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.patient-bookings-page__title {
  margin: 0;
  color: #14323f;
  font-family: "Newsreader", serif;
  font-size: clamp(2rem, 4vw, 3rem);
}

.patient-bookings-page__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  justify-content: end;
}

.patient-bookings-page__description {
  margin: 1rem 0 1.5rem;
  color: #32505d;
  line-height: 1.6;
}

.patient-bookings-page__booking-list {
  display: grid;
  gap: 0.9rem;
}

.patient-bookings-page__booking-summary-row {
  display: flex;
  justify-content: flex-start;
}

.patient-bookings-page__booking-card {
  padding: 1rem 1.1rem;
  border: 1px solid rgba(20, 50, 63, 0.06);
  border-radius: 1.25rem;
  background: rgba(244, 246, 243, 0.9);
}

.patient-bookings-page__booking-card--upcoming {
  background: rgba(232, 244, 249, 0.96);
  border-color: rgba(40, 83, 107, 0.16);
}

.patient-bookings-page__booking-head {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 1rem;
}

.patient-bookings-page__booking-main {
  display: grid;
  gap: 0.65rem;
}

.patient-bookings-page__booking-title-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}

.patient-bookings-page__booking-title {
  margin: 0;
  color: #14323f;
  font-weight: 700;
  font-size: 1.1rem;
}

.patient-bookings-page__booking-copy,
.patient-bookings-page__booking-meta {
  margin: 0;
  color: #32505d;
  line-height: 1.6;
}

.patient-bookings-page__booking-meta-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.65rem 1rem;
}

.patient-bookings-page__booking-meta span {
  display: block;
  color: #6c8f7d;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.patient-bookings-page__booking-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.patient-bookings-page__booking-empty {
  padding: 1.5rem 1.1rem;
  text-align: center;
  border-radius: 1.25rem;
  background: rgba(244, 246, 243, 0.9);
}

.patient-bookings-page__booking-empty-title {
  margin: 0.5rem 0;
  color: #14323f;
  font-family: "Newsreader", serif;
  font-size: 1.25rem;
}

.patient-bookings-page__summary-copy {
  margin: 0;
  color: #32505d;
  line-height: 1.6;
}

@media (max-width: 768px) {
  .patient-bookings-page__header {
    flex-direction: column;
  }

  .patient-bookings-page__actions {
    justify-content: start;
  }

  .patient-bookings-page__booking-meta-grid {
    grid-template-columns: 1fr;
  }
}
</style>
