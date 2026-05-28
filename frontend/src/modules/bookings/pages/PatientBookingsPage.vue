<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";

import { useDocumentsStore } from "../../documents/store";
import { filterDocumentsByRelatedEntity } from "../../documents/utils";
import RelatedDocumentsPanel from "../../documents/components/RelatedDocumentsPanel.vue";
import { usePrescriptionsStore } from "../../prescriptions/store";
import { formatPrescriptionDisplayLabel } from "../../prescriptions/utils";
import {
  prescriptionTypes,
  type PrescriptionRecord,
  type PrescriptionType,
} from "../../prescriptions/types";
import BookingFormDialog from "../components/BookingFormDialog.vue";
import { useBookingsStore } from "../store";
import type {
  BookingAttachedDocumentPayload,
  BookingListFilters,
  BookingRecord,
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
const isBookingDeleting = ref(false);
const isBookingFormOpen = ref(false);
const editingBooking = ref<BookingRecord | null>(null);
const dateFilterError = ref("");
const filters = reactive({
  facilityId: null as string | null,
  from: "",
  includeArchived: false,
  page: 1,
  pageSize: 20,
  prescriptionType: null as PrescriptionType | null,
  search: "",
  subtype: "",
  to: "",
});

const patientId = computed(() => route.params.patientId as string);
const bookings = computed(() => bookingsStore.bookings);
const pagination = computed(() => bookingsStore.pagination);
const prescriptions = computed(() => prescriptionsStore.prescriptions);
const facilities = computed(() => bookingsStore.facilities);
const documents = computed(() => documentsStore.documents);
const nowDateTime = computed(() => new Date().toISOString());

const upcomingBookings = computed(() =>
  bookings.value.filter(
    (booking) =>
      booking.deletedAt === null &&
      booking.appointmentAt !== null &&
      booking.appointmentAt >= nowDateTime.value,
  ),
);

const resolvePrescriptionDefaultBookingTitle = (
  prescription: PrescriptionRecord,
): string => {
  const titleParts = [t(`prescriptions.types.${prescription.prescriptionType}`)];
  const subtype = prescription.subtype?.trim();

  if (subtype) {
    titleParts.push(subtype);
  }

  return titleParts.join(" - ");
};

const bookingPrescriptionOptions = computed(() => [
  {
    defaultTitle: null,
    label: t("bookings.unlinkedPrescription"),
    value: null,
  },
  ...prescriptions.value.map((prescription) => ({
    defaultTitle: resolvePrescriptionDefaultBookingTitle(prescription),
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

const facilityFilterOptions = computed(() => [
  {
    label: t("bookings.filters.allFacilities"),
    value: null,
  },
  ...facilityOptions.value,
]);

const prescriptionTypeFilterOptions = computed(() => [
  {
    label: t("bookings.filters.allPrescriptionTypes"),
    value: null,
  },
  ...prescriptionTypes.map((prescriptionType) => ({
    label: t(`prescriptions.types.${prescriptionType}`),
    value: prescriptionType,
  })),
]);

const hasActiveFilters = computed(
  () =>
    Boolean(filters.search.trim()) ||
    Boolean(filters.prescriptionType) ||
    Boolean(filters.subtype.trim()) ||
    Boolean(filters.from) ||
    Boolean(filters.to) ||
    Boolean(filters.facilityId) ||
    filters.includeArchived,
);

const toFilterStartDateTime = (value: string): string | undefined => {
  if (!value) {
    return undefined;
  }

  return new Date(`${value}T00:00:00`).toISOString();
};

const toFilterEndDateTime = (value: string): string | undefined => {
  if (!value) {
    return undefined;
  }

  return new Date(`${value}T23:59:59.999`).toISOString();
};

const buildBookingFilters = (): BookingListFilters => {
  const bookingFilters: BookingListFilters = {
    includeArchived: filters.includeArchived,
    page: filters.page,
    pageSize: filters.pageSize,
  };
  const from = toFilterStartDateTime(filters.from);
  const search = filters.search.trim();
  const subtype = filters.subtype.trim();
  const to = toFilterEndDateTime(filters.to);

  if (filters.facilityId) {
    bookingFilters.facilityId = filters.facilityId;
  }

  if (from) {
    bookingFilters.from = from;
  }

  if (filters.prescriptionType) {
    bookingFilters.prescriptionType = filters.prescriptionType;
  }

  if (search) {
    bookingFilters.search = search;
  }

  if (subtype) {
    bookingFilters.subtype = subtype;
  }

  if (to) {
    bookingFilters.to = to;
  }

  return bookingFilters;
};

const loadBookings = async () => {
  await bookingsStore.loadBookings(patientId.value, buildBookingFilters());
};

const loadPage = async () => {
  isLoading.value = true;
  errorMessage.value = "";

  try {
    await Promise.all([
      loadBookings(),
      bookingsStore.loadFacilities(),
      prescriptionsStore.loadPrescriptions(patientId.value, { pageSize: 100 }),
      documentsStore.loadDocuments(patientId.value),
    ]);
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : t("bookings.genericError");
  } finally {
    isLoading.value = false;
  }
};

const applyFilters = async () => {
  dateFilterError.value = "";

  if (filters.from && filters.to && filters.from > filters.to) {
    dateFilterError.value = t("bookings.filters.dateRangeError");
    return;
  }

  filters.page = 1;

  try {
    await loadBookings();
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : t("bookings.genericError");
  }
};

const resetFilters = async () => {
  filters.facilityId = null;
  filters.from = "";
  filters.includeArchived = false;
  filters.page = 1;
  filters.prescriptionType = null;
  filters.search = "";
  filters.subtype = "";
  filters.to = "";
  dateFilterError.value = "";
  await applyFilters();
};

const handlePageChange = async (page: number) => {
  filters.page = page;

  try {
    await loadBookings();
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : t("bookings.genericError");
  }
};

watch(patientId, async () => {
  await loadPage();
});

onMounted(async () => {
  await loadPage();
});

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
  return booking.title;
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

const handleDeleteBooking = async (booking: BookingRecord) => {
  if (
    !window.confirm(
      t("bookings.deleteConfirm", {
        title: resolveBookingTitle(booking),
      }),
    )
  ) {
    return;
  }

  isBookingDeleting.value = true;
  errorMessage.value = "";

  try {
    await bookingsStore.deleteBooking(booking.id);
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : t("bookings.genericError");
  } finally {
    isBookingDeleting.value = false;
  }
};

const handleBookingSubmit = async (
  payload: BookingUpsertPayload,
  facilityPayload: FacilityUpsertPayload | null,
  attachedDocument: BookingAttachedDocumentPayload | null,
) => {
  isBookingSaving.value = true;

  errorMessage.value = "";

  try {
    const bookingPayload: BookingUpsertPayload = {
      ...payload,
      facility: facilityPayload,
      facilityId: facilityPayload ? null : payload.facilityId,
    };
    let savedBooking: BookingRecord;

    if (editingBooking.value) {
      savedBooking = await bookingsStore.updateBooking(
        editingBooking.value.id,
        {
          appointmentAt: bookingPayload.appointmentAt,
          bookedAt: bookingPayload.bookedAt,
          facility: facilityPayload,
          facilityId: bookingPayload.facilityId,
          notes: bookingPayload.notes,
          prescriptionId: bookingPayload.prescriptionId,
          title: bookingPayload.title,
        },
      );
    } else {
      savedBooking = await bookingsStore.createBooking(
        patientId.value,
        bookingPayload,
      );
    }

    let documentUploadError = "";

    if (attachedDocument) {
      try {
        await documentsStore.uploadDocument(patientId.value, {
          documentType: attachedDocument.documentType,
          file: attachedDocument.file,
          notes: attachedDocument.notes,
          relatedEntityId: savedBooking.id,
          relatedEntityType: "booking",
        });
      } catch (error) {
        documentUploadError =
          error instanceof Error
            ? t("bookings.document.uploadErrorWithDetail", {
                detail: error.message,
              })
            : t("bookings.document.uploadError");
      }
    }

    if (facilityPayload) {
      await bookingsStore.loadFacilities();
    }

    isBookingFormOpen.value = false;
    editingBooking.value = null;

    if (documentUploadError) {
      errorMessage.value = documentUploadError;
    }
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

        <div class="patient-bookings-page__summary">
          <q-chip square color="white" text-color="primary" icon="event">
            {{
              $t("bookings.summaryCount", {
                count: pagination.total,
              })
            }}
          </q-chip>
          <q-chip square color="white" text-color="primary" icon="schedule">
            {{
              $t("bookings.upcomingCount", {
                count: upcomingBookings.length,
              })
            }}
          </q-chip>
        </div>

        <q-card flat class="patient-bookings-page__filters">
          <div class="patient-bookings-page__filter-grid">
            <q-input
              v-model="filters.search"
              outlined
              dense
              clearable
              :label="$t('bookings.filters.searchLabel')"
              :placeholder="$t('bookings.filters.searchPlaceholder')"
              @keyup.enter="applyFilters"
            />
            <q-select
              v-model="filters.prescriptionType"
              outlined
              dense
              emit-value
              map-options
              :label="$t('bookings.filters.prescriptionTypeLabel')"
              :options="prescriptionTypeFilterOptions"
            />
            <q-input
              v-model="filters.subtype"
              outlined
              dense
              clearable
              :label="$t('bookings.filters.subtypeLabel')"
              @keyup.enter="applyFilters"
            />
            <q-select
              v-model="filters.facilityId"
              outlined
              dense
              emit-value
              map-options
              :label="$t('bookings.filters.facilityLabel')"
              :options="facilityFilterOptions"
            />
            <q-input
              v-model="filters.from"
              outlined
              dense
              type="date"
              :label="$t('bookings.filters.startDateLabel')"
            />
            <q-input
              v-model="filters.to"
              outlined
              dense
              type="date"
              :label="$t('bookings.filters.endDateLabel')"
            />
            <q-toggle
              v-model="filters.includeArchived"
              color="primary"
              :label="$t('bookings.filters.includeArchived')"
            />
          </div>

          <q-banner
            v-if="dateFilterError"
            dense
            rounded
            class="bg-warning text-white"
          >
            {{ dateFilterError }}
          </q-banner>

          <div class="patient-bookings-page__filter-actions">
            <q-btn
              color="primary"
              unelevated
              no-caps
              icon="search"
              :label="$t('bookings.filters.apply')"
              @click="applyFilters"
            />
            <q-btn
              flat
              no-caps
              color="primary"
              icon="restart_alt"
              :disable="!hasActiveFilters"
              :label="$t('bookings.filters.reset')"
              @click="resetFilters"
            />
          </div>
        </q-card>

        <div
          v-if="bookings.length"
          class="patient-bookings-page__booking-list"
        >
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
                    v-if="booking.deletedAt"
                    rounded
                    color="grey-7"
                    text-color="white"
                    :label="$t('bookings.archivedBadge')"
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
                  :key="`edit-booking-${booking.id}`"
                  flat
                  color="primary"
                  icon="edit"
                  no-caps
                  :label="$t('bookings.edit')"
                  @click="openEditBookingDialog(booking)"
                />
                <q-btn
                  :key="`delete-booking-${booking.id}`"
                  flat
                  color="negative"
                  icon="delete"
                  no-caps
                  :disable="Boolean(booking.deletedAt)"
                  :loading="isBookingDeleting"
                  :label="$t('bookings.deleteAction')"
                  @click="handleDeleteBooking(booking)"
                />
              </div>
            </div>
          </q-card>

          <div
            v-if="pagination.totalPages > 1"
            class="patient-bookings-page__pagination"
          >
            <q-pagination
              :model-value="pagination.page"
              :max="pagination.totalPages"
              :max-pages="7"
              boundary-numbers
              direction-links
              @update:model-value="handlePageChange"
            />
          </div>
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
            {{
              hasActiveFilters
                ? $t("bookings.emptyFilteredTitle")
                : $t("bookings.emptyTitle")
            }}
          </h3>
          <p class="patient-bookings-page__summary-copy">
            {{
              hasActiveFilters
                ? $t("bookings.emptyFilteredDescription")
                : $t("bookings.emptyDescription")
            }}
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

.patient-bookings-page__summary {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.patient-bookings-page__filters {
  display: grid;
  gap: 1rem;
  padding: 1rem;
  margin-bottom: 1rem;
  border: 1px solid rgba(20, 50, 63, 0.08);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.9);
}

.patient-bookings-page__filter-grid {
  display: grid;
  align-items: center;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.85rem;
}

.patient-bookings-page__filter-actions,
.patient-bookings-page__pagination {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.75rem;
}

.patient-bookings-page__booking-list {
  display: grid;
  gap: 0.9rem;
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

  .patient-bookings-page__filter-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .patient-bookings-page__booking-meta-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 560px) {
  .patient-bookings-page__filter-grid {
    grid-template-columns: 1fr;
  }

  .patient-bookings-page__filter-actions,
  .patient-bookings-page__pagination {
    justify-content: flex-start;
    flex-wrap: wrap;
  }
}
</style>
