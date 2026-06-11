<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";

import { useBookingsStore } from "../../bookings/store";
import type { FacilityUpsertPayload } from "../../bookings/types";
import { formatBookingDisplayLabel } from "../../bookings/utils";
import DocumentPreviewDialog from "../../documents/components/DocumentPreviewDialog.vue";
import { useDocumentsStore } from "../../documents/store";
import type { DocumentRecord, DocumentType } from "../../documents/types";
import { usePatientsStore } from "../../patients/store";
import { downloadBlob } from "../../../utils/download";
import { slugifyFilePart } from "../../../utils/file-names";
import CareEventFormDialog from "../components/CareEventFormDialog.vue";
import {
  buildCareEventReportsPdf,
  type CareEventReportPdfEntry,
} from "../pdf";
import { useCareEventsStore } from "../store";
import type {
  CareEventListFilters,
  CareEventRecord,
  CareEventType,
  CareEventUpsertPayload,
} from "../types";
import { careEventTypes } from "../types";

const route = useRoute();
const router = useRouter();
const { d, t } = useI18n();

const patientsStore = usePatientsStore();
const bookingsStore = useBookingsStore();
const documentsStore = useDocumentsStore();
const careEventsStore = useCareEventsStore();

const isLoading = ref(false);
const isSaving = ref(false);
const isDeleting = ref(false);
const isExportingReportsPdf = ref(false);
const isFormOpen = ref(false);
const isPreviewOpen = ref(false);
const isReportExportOpen = ref(false);
const editingCareEvent = ref<CareEventRecord | null>(null);
const errorMessage = ref("");
const previewDocument = ref<DocumentRecord | null>(null);
const filters = reactive({
  eventType: null as CareEventType | null,
  facilityId: null as string | null,
  from: "",
  page: 1,
  pageSize: 20,
  search: "",
  subtype: "",
  to: "",
});
const reportExportForm = reactive({
  eventTypes: [] as CareEventType[],
  subtypeKeys: [] as string[],
});

const patientId = computed(() => route.params.patientId as string);
const patient = computed(() => patientsStore.currentPatient);
const currentPatientName = computed(() =>
  patient.value?.id === patientId.value ? patient.value.fullName : null,
);
const bookings = computed(() => bookingsStore.activeBookings);
const facilities = computed(() => bookingsStore.facilities);
const careEvents = computed(() => careEventsStore.careEvents);
const pagination = computed(() => careEventsStore.pagination);
const documents = computed(() => documentsStore.documents);
const careEventSubtypeOptionsByType = computed(
  () => careEventsStore.subtypesByType,
);
const bookingOptions = computed(() =>
  bookings.value.map((booking) => ({
    label: formatBookingDisplayLabel(booking, {
      d,
      facilities: facilities.value,
      t,
    }),
    value: booking.id,
  })),
);

const facilityOptions = computed(() =>
  facilities.value.map((facility) => ({
    label: [facility.name, facility.city].filter(Boolean).join(" · "),
    value: facility.id,
  })),
);

const eventTypeFilterOptions = computed(() => [
  {
    label: t("careEvents.filters.allTypes"),
    value: null,
  },
  ...careEventTypes.map((eventType) => ({
    label: t(`careEvents.types.${eventType}`),
    value: eventType,
  })),
]);

const reportEventTypeOptions = computed(() =>
  careEventTypes.map((eventType) => ({
    label: t(`careEvents.types.${eventType}`),
    value: eventType,
  })),
);

const buildSubtypeSelectionKey = (
  eventType: CareEventType,
  subtype: string,
): string => `${eventType}:${encodeURIComponent(subtype)}`;

const parseSubtypeSelectionKey = (
  key: string,
): { eventType: CareEventType; subtype: string } | null => {
  const separatorIndex = key.indexOf(":");

  if (separatorIndex === -1) {
    return null;
  }

  const eventType = key.slice(0, separatorIndex) as CareEventType;

  if (!careEventTypes.includes(eventType)) {
    return null;
  }

  return {
    eventType,
    subtype: decodeURIComponent(key.slice(separatorIndex + 1)),
  };
};

const reportSubtypeOptions = computed(() =>
  careEventTypes.flatMap((eventType) =>
    careEventSubtypeOptionsByType.value[eventType].map((subtype) => ({
      label: `${subtype} (${t(`careEvents.types.${eventType}`)})`,
      value: buildSubtypeSelectionKey(eventType, subtype),
    })),
  ),
);

const facilityFilterOptions = computed(() => [
  {
    label: t("careEvents.filters.allFacilities"),
    value: null,
  },
  ...facilityOptions.value,
]);

const hasActiveFilters = computed(
  () =>
    Boolean(filters.search.trim()) ||
    Boolean(filters.eventType) ||
    Boolean(filters.subtype.trim()) ||
    Boolean(filters.from) ||
    Boolean(filters.to) ||
    Boolean(filters.facilityId),
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

const buildCareEventFilters = (): CareEventListFilters => {
  const careEventFilters: CareEventListFilters = {
    page: filters.page,
    pageSize: filters.pageSize,
  };
  const from = toFilterStartDateTime(filters.from);
  const search = filters.search.trim();
  const subtype = filters.subtype.trim();
  const to = toFilterEndDateTime(filters.to);

  if (filters.eventType) {
    careEventFilters.eventType = filters.eventType;
  }

  if (filters.facilityId) {
    careEventFilters.facilityId = filters.facilityId;
  }

  if (from) {
    careEventFilters.from = from;
  }

  if (search) {
    careEventFilters.search = search;
  }

  if (subtype) {
    careEventFilters.subtype = subtype;
  }

  if (to) {
    careEventFilters.to = to;
  }

  return careEventFilters;
};

const loadCareEvents = async () => {
  await careEventsStore.loadCareEvents(patientId.value, buildCareEventFilters());
};

const loadPage = async () => {
  isLoading.value = true;
  errorMessage.value = "";

  try {
    await Promise.all([
      patientsStore.loadPatient(patientId.value),
      bookingsStore.loadBookings(patientId.value, { pageSize: 100 }),
      bookingsStore.loadFacilities(),
      documentsStore.loadDocuments(patientId.value),
      careEventsStore.loadCareEventSubtypes(patientId.value),
      loadCareEvents(),
    ]);
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : t("careEvents.genericError");
  } finally {
    isLoading.value = false;
  }
};

const applyFilters = async () => {
  dateTimeFilterError.value = "";

  if (filters.from && filters.to && filters.from > filters.to) {
    dateTimeFilterError.value = t("careEvents.filters.dateRangeError");
    return;
  }

  filters.page = 1;

  try {
    await loadCareEvents();
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : t("careEvents.genericError");
  }
};

const resetFilters = async () => {
  filters.eventType = null;
  filters.facilityId = null;
  filters.from = "";
  filters.page = 1;
  filters.search = "";
  filters.subtype = "";
  filters.to = "";
  dateTimeFilterError.value = "";
  await applyFilters();
};

const handlePageChange = async (page: number) => {
  filters.page = page;

  try {
    await loadCareEvents();
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : t("careEvents.genericError");
  }
};

watch(patientId, async () => {
  await loadPage();
});

onMounted(async () => {
  await loadPage();
});

const dateTimeFilterError = ref("");

const formatDateTime = (value: string | null) => {
  if (!value) {
    return t("careEvents.emptyDate");
  }

  return d(new Date(value), "short");
};

const formatDateTimeWithTime = (value: string | null) => {
  if (!value) {
    return t("careEvents.emptyDate");
  }

  return d(new Date(value), "long");
};

const resolveFacilityLabel = (facilityId: string | null) => {
  if (!facilityId) {
    return t("careEvents.unlinkedFacility");
  }

  const facility = facilities.value.find((item) => item.id === facilityId);

  if (!facility) {
    return t("careEvents.missingFacility");
  }

  return [facility.name, facility.city].filter(Boolean).join(" · ");
};

const resolveBookingLabel = (bookingId: string | null) => {
  if (!bookingId) {
    return t("careEvents.unlinkedBooking");
  }

  const booking = bookings.value.find((item) => item.id === bookingId);

  if (!booking) {
    return t("careEvents.missingBooking");
  }

  return formatBookingDisplayLabel(booking, {
    d,
    facilities: facilities.value,
    t,
  });
};

const resolveDocumentsList = (careEventId: string): DocumentRecord[] =>
  documents.value.filter(
    (document) =>
      document.relatedEntityType === "care_event" &&
      document.relatedEntityId === careEventId,
  );

const normalizeSubtypeForMatch = (value: string | null | undefined): string =>
  value?.trim().toLowerCase() ?? "";

const openDocumentPreview = (document: DocumentRecord) => {
  previewDocument.value = document;
  isPreviewOpen.value = true;
};

const resolveCareEventTitle = (careEvent: CareEventRecord): string => {
  const titleParts = [t(`careEvents.types.${careEvent.eventType}`)];
  const subtype = careEvent.subtype?.trim();

  if (subtype) {
    titleParts.push(subtype);
  }

  titleParts.push(formatDateTimeWithTime(careEvent.completedAt));

  return titleParts.join(" · ");
};

const toPdfLabel = (value: string): string => value.replace(/\s+·\s+/g, " - ");

const formatFileSize = (value: number): string => {
  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

const matchesReportExportSelection = (
  careEvent: CareEventRecord,
  selectedSubtypeKeys: string[],
): boolean => {
  const eventTypeMatches =
    reportExportForm.eventTypes.length === 0 ||
    reportExportForm.eventTypes.includes(careEvent.eventType);

  if (!eventTypeMatches) {
    return false;
  }

  const selectedSubtypes = selectedSubtypeKeys
    .map(parseSubtypeSelectionKey)
    .filter((selection) => selection !== null);

  if (selectedSubtypes.length === 0) {
    return true;
  }

  const careEventSubtype = normalizeSubtypeForMatch(careEvent.subtype);

  return selectedSubtypes.some(
    (selection) =>
      selection.eventType === careEvent.eventType &&
      normalizeSubtypeForMatch(selection.subtype) === careEventSubtype,
  );
};

const buildCareEventReportPdfEntries = (
  selectedCareEvents: CareEventRecord[],
): CareEventReportPdfEntry[] =>
  selectedCareEvents.flatMap((careEvent) => {
    const linkedDocuments = resolveDocumentsList(careEvent.id);
    const baseEntry: Omit<CareEventReportPdfEntry, "document" | "id"> = {
      booking: toPdfLabel(resolveBookingLabel(careEvent.bookingId)),
      careEventId: careEvent.id,
      completedAt: formatDateTimeWithTime(careEvent.completedAt),
      eventType: t(`careEvents.types.${careEvent.eventType}`),
      facility: toPdfLabel(resolveFacilityLabel(careEvent.facilityId)),
      notes: careEvent.outcomeNotes?.trim() || t("careEvents.emptyOutcomeNotes"),
      provider:
        careEvent.providerName?.trim() || t("careEvents.emptyProviderName"),
      sortValue: careEvent.completedAt,
      subtype: careEvent.subtype?.trim() || t("careEvents.emptySubtype"),
      title: toPdfLabel(resolveCareEventTitle(careEvent)),
    };

    if (linkedDocuments.length === 0) {
      return [
        {
          ...baseEntry,
          document: null,
          id: `${careEvent.id}:summary`,
        },
      ] satisfies CareEventReportPdfEntry[];
    }

    return linkedDocuments.map(
      (document): CareEventReportPdfEntry => ({
        ...baseEntry,
        document: {
          documentType: t(`documents.types.${document.documentType}`),
          fileSize: formatFileSize(document.fileSizeBytes),
          filename: document.originalFilename,
          notes:
            document.notes?.trim() || t("careEvents.export.emptyDocumentNotes"),
          uploadedAt: formatDateTimeWithTime(document.uploadedAt),
        },
        id: `${careEvent.id}:${document.id}`,
      }),
    );
  });

const buildReportExportFiltersSummary = (): string[] => [
  `${t("careEvents.export.selectedEventTypes")}: ${
    reportExportForm.eventTypes.length
      ? reportExportForm.eventTypes
          .map((eventType) => t(`careEvents.types.${eventType}`))
          .join(", ")
      : t("careEvents.export.allEventTypes")
  }`,
  `${t("careEvents.export.selectedSubtypes")}: ${
    reportExportForm.subtypeKeys.length
      ? reportExportForm.subtypeKeys
          .map((key) => {
            const option = reportSubtypeOptions.value.find(
              (item) => item.value === key,
            );

            return option?.label ?? key;
          })
          .join(", ")
      : t("careEvents.export.allSubtypes")
  }`,
];

const buildReportPdfFileName = (): string => {
  const patientName =
    currentPatientName.value ?? t("careEvents.export.patient");
  const patientSlug = slugifyFilePart(patientName, "paziente");
  const dateSlug = new Date().toISOString().slice(0, 10);

  return `dossier-referti-${patientSlug}-${dateSlug}.pdf`;
};

const openReportExportDialog = () => {
  isReportExportOpen.value = true;
};

const resetReportExportForm = () => {
  reportExportForm.eventTypes = [];
  reportExportForm.subtypeKeys = [];
};

const handleReportsPdfExport = async () => {
  isExportingReportsPdf.value = true;
  errorMessage.value = "";

  try {
    const exportCareEvents = await careEventsStore.loadCareEventsForExport(
      patientId.value,
      {},
    );
    const selectedSubtypeKeys = [...reportExportForm.subtypeKeys];
    const selectedCareEvents = exportCareEvents.filter((careEvent) =>
      matchesReportExportSelection(careEvent, selectedSubtypeKeys),
    );
    const selectedDocumentCount = selectedCareEvents.reduce(
      (count, careEvent) => count + resolveDocumentsList(careEvent.id).length,
      0,
    );
    const pdfBlob = buildCareEventReportsPdf({
      documentCount: selectedDocumentCount,
      entries: buildCareEventReportPdfEntries(selectedCareEvents),
      eventCount: selectedCareEvents.length,
      filtersSummary: buildReportExportFiltersSummary(),
      generatedAt: d(new Date(), "long"),
      labels: {
        booking: t("careEvents.fields.booking"),
        completedAt: t("careEvents.fields.completedAt"),
        document: t("careEvents.export.document"),
        documentCount: t("careEvents.export.documentCount"),
        documentNotes: t("careEvents.export.documentNotes"),
        documentType: t("documents.fields.documentType"),
        emptyDocument: t("careEvents.export.emptyDocument"),
        eventCount: t("careEvents.export.eventCount"),
        eventType: t("careEvents.fields.eventType"),
        facility: t("careEvents.fields.facility"),
        fileSize: t("careEvents.export.fileSize"),
        filters: t("careEvents.export.filters"),
        generatedAt: t("careEvents.export.generatedAt"),
        indexTitle: t("careEvents.export.indexTitle"),
        initialSummary: t("careEvents.export.initialSummary"),
        noEntries: t("careEvents.export.noEntries"),
        notes: t("careEvents.fields.outcomeNotes"),
        page: t("careEvents.export.pageLabel"),
        patient: t("careEvents.export.patient"),
        provider: t("careEvents.fields.providerName"),
        reportCount: t("careEvents.export.reportCount"),
        sourceEvent: t("careEvents.export.sourceEvent"),
        subtype: t("careEvents.fields.subtype"),
        uploadedAt: t("documents.uploadedAt"),
      },
      patientName: currentPatientName.value,
      title: t("careEvents.export.title"),
    });

    downloadBlob(pdfBlob, buildReportPdfFileName());
    isReportExportOpen.value = false;
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : t("careEvents.export.error");
  } finally {
    isExportingReportsPdf.value = false;
  }
};

const openCreateDialog = () => {
  editingCareEvent.value = null;
  isFormOpen.value = true;
};

const openEditDialog = (careEvent: CareEventRecord) => {
  editingCareEvent.value = careEvent;
  isFormOpen.value = true;
};

const handleDeleteCareEvent = async (careEvent: CareEventRecord) => {
  if (
    !window.confirm(
      t("careEvents.deleteConfirm", {
        title: resolveCareEventTitle(careEvent),
      }),
    )
  ) {
    return;
  }

  isDeleting.value = true;
  errorMessage.value = "";

  try {
    await careEventsStore.deleteCareEvent(careEvent.id);
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : t("careEvents.genericError");
  } finally {
    isDeleting.value = false;
  }
};

const handleDialogModelChange = (value: boolean) => {
  isFormOpen.value = value;

  if (!value) {
    editingCareEvent.value = null;
  }
};

const handleSubmit = async (payload: {
  careEvent: CareEventUpsertPayload;
  facilityPayload: FacilityUpsertPayload | null;
  attachedDocument: {
    documentType: DocumentType;
    file: File;
    notes: string | null;
  } | null;
}) => {
  isSaving.value = true;
  errorMessage.value = "";

  try {
    const careEventPayload: CareEventUpsertPayload = {
      ...payload.careEvent,
      facilityId: payload.facilityPayload ? null : payload.careEvent.facilityId,
    };
    const shouldUseCompositeEndpoint = Boolean(
      payload.facilityPayload || payload.attachedDocument,
    );

    if (editingCareEvent.value) {
      if (shouldUseCompositeEndpoint) {
        const result = await careEventsStore.updateCareEventWithRelatedData(
          editingCareEvent.value.id,
          {
            attachedDocument: payload.attachedDocument,
            careEvent: careEventPayload,
            facilityPayload: payload.facilityPayload,
          },
        );

        if (result.document) {
          documentsStore.recordDocument(result.document);
        }
      } else {
        await careEventsStore.updateCareEvent(editingCareEvent.value.id, {
          ...careEventPayload,
        });
      }
    } else {
      if (shouldUseCompositeEndpoint) {
        const result = await careEventsStore.createCareEventWithRelatedData(
          patientId.value,
          {
            attachedDocument: payload.attachedDocument,
            careEvent: careEventPayload,
            facilityPayload: payload.facilityPayload,
          },
        );

        if (result.document) {
          documentsStore.recordDocument(result.document);
        }
      } else {
        await careEventsStore.createCareEvent(patientId.value, {
          ...careEventPayload,
        });
      }
    }

    if (payload.facilityPayload) {
      await bookingsStore.loadFacilities();
    }

    isFormOpen.value = false;
    editingCareEvent.value = null;
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : t("careEvents.genericError");
  } finally {
    isSaving.value = false;
  }
};

const openOverviewAnchor = async (anchor: string) => {
  await router.push({
    hash: anchor,
    path: `/app/patients/${patientId.value}/overview`,
  });
};

</script>

<template>
  <q-page class="patient-care-events-page">
    <q-banner
      v-if="errorMessage"
      dense
      rounded
      class="patient-care-events-page__banner bg-negative text-white"
    >
      {{ errorMessage }}
    </q-banner>

    <section class="patient-care-events-page__hero">
      <div v-if="isLoading" class="patient-care-events-page__loading">
        <q-spinner color="primary" size="2rem" />
      </div>

      <template v-else>
        <div class="patient-care-events-page__header">
          <div>
            <p class="patient-care-events-page__eyebrow">
              {{ $t("careEvents.eyebrow") }}
            </p>
            <h1 class="patient-care-events-page__title">
              {{ $t("careEvents.title") }}
            </h1>
            <p class="patient-care-events-page__subtitle">
              {{
                $t("careEvents.subtitle", {
                  patientName: patient?.fullName ?? $t("patients.title"),
                })
              }}
            </p>
          </div>

          <div class="patient-care-events-page__actions">
            <q-btn
              flat
              no-caps
              color="primary"
              icon="arrow_back"
              :label="$t('careEvents.backToOverview')"
              @click="router.push(`/app/patients/${patientId}/overview`)"
            />
            <q-btn
              outline
              no-caps
              color="primary"
              icon="picture_as_pdf"
              :loading="isExportingReportsPdf"
              :disable="isLoading"
              :label="$t('careEvents.export.openAction')"
              @click="openReportExportDialog"
            />
            <q-btn
              color="primary"
              unelevated
              no-caps
              icon="add"
              :label="$t('careEvents.createAction')"
              @click="openCreateDialog"
            />
          </div>
        </div>

        <div class="patient-care-events-page__summary">
          <q-chip
            square
            color="white"
            text-color="primary"
            icon="history"
          >
            {{
              $t("careEvents.summaryCount", {
                count: pagination.total,
              })
            }}
          </q-chip>
        </div>

        <q-card flat class="patient-care-events-page__filters">
          <div class="patient-care-events-page__filter-grid">
            <q-input
              v-model="filters.search"
              outlined
              dense
              clearable
              :label="$t('careEvents.filters.searchLabel')"
              :placeholder="$t('careEvents.filters.searchPlaceholder')"
              @keyup.enter="applyFilters"
            />
            <q-select
              v-model="filters.eventType"
              outlined
              dense
              emit-value
              map-options
              :label="$t('careEvents.filters.typeLabel')"
              :options="eventTypeFilterOptions"
            />
            <q-input
              v-model="filters.subtype"
              outlined
              dense
              clearable
              :label="$t('careEvents.filters.subtypeLabel')"
              @keyup.enter="applyFilters"
            />
            <q-select
              v-model="filters.facilityId"
              outlined
              dense
              emit-value
              map-options
              :label="$t('careEvents.filters.facilityLabel')"
              :options="facilityFilterOptions"
            />
            <q-input
              v-model="filters.from"
              outlined
              dense
              type="date"
              :label="$t('careEvents.filters.startDateLabel')"
            />
            <q-input
              v-model="filters.to"
              outlined
              dense
              type="date"
              :label="$t('careEvents.filters.endDateLabel')"
            />
          </div>

          <q-banner
            v-if="dateTimeFilterError"
            dense
            rounded
            class="bg-warning text-white"
          >
            {{ dateTimeFilterError }}
          </q-banner>

          <div class="patient-care-events-page__filter-actions">
            <q-btn
              color="primary"
              unelevated
              no-caps
              icon="search"
              :label="$t('careEvents.filters.apply')"
              @click="applyFilters"
            />
            <q-btn
              flat
              no-caps
              color="primary"
              icon="restart_alt"
              :disable="!hasActiveFilters"
              :label="$t('careEvents.filters.reset')"
              @click="resetFilters"
            />
          </div>
        </q-card>

        <div v-if="careEvents.length" class="patient-care-events-page__list">
          <q-card
            v-for="careEvent in careEvents"
            :key="careEvent.id"
            :id="`care-event-${careEvent.id}`"
            flat
            class="patient-care-events-page__event"
          >
            <div class="patient-care-events-page__event-head">
              <div class="patient-care-events-page__event-main">
                <div class="patient-care-events-page__event-title-row">
                  <h2 class="patient-care-events-page__event-title">
                    {{ resolveCareEventTitle(careEvent) }}
                  </h2>
                </div>

                <p class="patient-care-events-page__event-copy">
                  {{
                    careEvent.outcomeNotes || $t("careEvents.emptyOutcomeNotes")
                  }}
                </p>

                <div class="patient-care-events-page__event-meta-grid">
                  <p class="patient-care-events-page__event-meta">
                    <span>{{ $t("careEvents.fields.subtype") }}</span>
                    {{ careEvent.subtype || $t("careEvents.emptySubtype") }}
                  </p>
                  <p class="patient-care-events-page__event-meta">
                    <span>{{ $t("careEvents.fields.providerName") }}</span>
                    {{
                      careEvent.providerName || $t("careEvents.emptyProviderName")
                    }}
                  </p>
                  <p class="patient-care-events-page__event-meta">
                    <span>{{ $t("careEvents.fields.facility") }}</span>
                    {{ resolveFacilityLabel(careEvent.facilityId) }}
                  </p>
                                    <p class="patient-care-events-page__event-meta">
                    <span>{{ $t("careEvents.fields.booking") }}</span>
                    {{ resolveBookingLabel(careEvent.bookingId) }}
                  </p>
                </div>

                <div
                  v-if="
                    careEvent.bookingId ||
                    resolveDocumentsList(careEvent.id).length
                  "
                  class="patient-care-events-page__related-links"
                >
                  <q-btn
                    v-if="careEvent.bookingId"
                    flat
                    color="accent"
                    icon="event"
                    no-caps
                    :label="$t('careEvents.openBookingLink')"
                    @click="openOverviewAnchor(`#booking-${careEvent.bookingId}`)"
                  />
                  <template
                    v-for="document in resolveDocumentsList(careEvent.id)"
                    :key="document.id"
                  >
                    <q-btn
                      flat
                      color="positive"
                      icon="visibility"
                      no-caps
                      :label="$t('documents.previewAction')"
                      @click="openDocumentPreview(document)"
                    >
                      <q-tooltip>{{ document.originalFilename }}</q-tooltip>
                    </q-btn>
                    <q-btn
                      flat
                      color="positive"
                      icon="download"
                      no-caps
                      :href="document.downloadUrl"
                      :label="
                        $t('careEvents.downloadDocumentLink', {
                          filename: document.originalFilename,
                        })
                      "
                      target="_blank"
                    />
                  </template>
                </div>
              </div>

              <div class="patient-care-events-page__event-actions">
                <q-btn
                  flat
                  color="primary"
                  icon="edit"
                  no-caps
                  :label="$t('careEvents.edit')"
                  @click="openEditDialog(careEvent)"
                />
                <q-btn
                  flat
                  color="negative"
                  icon="delete"
                  no-caps
                  :loading="isDeleting"
                  :label="$t('careEvents.deleteAction')"
                  @click="handleDeleteCareEvent(careEvent)"
                />
              </div>
            </div>
          </q-card>

          <div
            v-if="pagination.totalPages > 1"
            class="patient-care-events-page__pagination"
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

        <q-card v-else flat class="patient-care-events-page__empty">
          <p class="patient-care-events-page__eyebrow">
            {{ $t("careEvents.emptyEyebrow") }}
          </p>
          <h2 class="patient-care-events-page__empty-title">
            {{
              hasActiveFilters
                ? $t("careEvents.emptyFilteredTitle")
                : $t("careEvents.emptyTitle")
            }}
          </h2>
          <p class="patient-care-events-page__subtitle">
            {{
              hasActiveFilters
                ? $t("careEvents.emptyFilteredDescription")
                : $t("careEvents.emptyDescription")
            }}
          </p>
        </q-card>
      </template>
    </section>

    <CareEventFormDialog
      v-model="isFormOpen"
      :booking-options="bookingOptions"
      :care-event="editingCareEvent"
      :facility-options="facilityOptions"
      :loading="isSaving"
      :submit-label="$t('careEvents.save')"
      :subtype-options-by-type="careEventSubtypeOptionsByType"
      
      :title="
        editingCareEvent
          ? $t('careEvents.editTitle')
          : $t('careEvents.createTitle')
      "
      @submit="handleSubmit"
      @update:model-value="handleDialogModelChange"
    />

    <q-dialog v-model="isReportExportOpen">
      <q-card class="care-event-report-dialog">
        <q-card-section class="care-event-report-dialog__header">
          <h2 class="care-event-report-dialog__title">
            {{ $t("careEvents.export.dialogTitle") }}
          </h2>
          <q-btn
            flat
            round
            dense
            icon="close"
            :aria-label="$t('common.close')"
            @click="isReportExportOpen = false"
          />
        </q-card-section>

        <q-card-section class="care-event-report-dialog__body">
          <q-select
            v-model="reportExportForm.eventTypes"
            outlined
            multiple
            use-chips
            emit-value
            map-options
            :disable="isExportingReportsPdf"
            :label="$t('careEvents.export.eventTypesLabel')"
            :options="reportEventTypeOptions"
          />

          <q-select
            v-model="reportExportForm.subtypeKeys"
            outlined
            multiple
            use-chips
            emit-value
            map-options
            :disable="isExportingReportsPdf || reportSubtypeOptions.length === 0"
            :label="$t('careEvents.export.subtypesLabel')"
            :options="reportSubtypeOptions"
          />
        </q-card-section>

        <q-card-actions align="right">
          <q-btn
            flat
            no-caps
            color="primary"
            icon="restart_alt"
            :disable="isExportingReportsPdf"
            :label="$t('careEvents.export.resetSelection')"
            @click="resetReportExportForm"
          />
          <q-btn
            flat
            no-caps
            :disable="isExportingReportsPdf"
            :label="$t('common.cancel')"
            @click="isReportExportOpen = false"
          />
          <q-btn
            color="primary"
            unelevated
            no-caps
            icon="picture_as_pdf"
            :loading="isExportingReportsPdf"
            :label="$t('careEvents.export.generateAction')"
            @click="handleReportsPdfExport"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <DocumentPreviewDialog
      v-model="isPreviewOpen"
      :document="previewDocument"
    />
  </q-page>
</template>

<style scoped>
.patient-care-events-page {
  display: grid;
  gap: 1rem;
}

.patient-care-events-page__banner {
  margin-bottom: 0.5rem;
}

.patient-care-events-page__hero {
  display: grid;
  gap: 1.25rem;
}

.patient-care-events-page__loading,
.patient-care-events-page__header,
.patient-care-events-page__event-head,
.patient-care-events-page__event-title-row,
.patient-care-events-page__actions,
.patient-care-events-page__related-links {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.patient-care-events-page__header {
  padding: 1.5rem;
  border-radius: 1.5rem;
  background:
    linear-gradient(135deg, rgba(20, 50, 63, 0.92), rgba(36, 89, 110, 0.88)),
    #16313f;
  color: white;
}

.patient-care-events-page__loading {
  justify-content: center;
  padding: 3rem 1rem;
}

.patient-care-events-page__eyebrow {
  margin: 0 0 0.5rem;
  color: #d99866;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.patient-care-events-page__title,
.patient-care-events-page__empty-title,
.patient-care-events-page__event-title {
  margin: 0;
  font-family: "Fraunces", serif;
}

.patient-care-events-page__title {
  font-size: clamp(2rem, 4vw, 2.8rem);
}

.patient-care-events-page__subtitle,
.patient-care-events-page__event-copy,
.patient-care-events-page__event-meta {
  margin: 0;
  line-height: 1.6;
}

.patient-care-events-page__subtitle {
  max-width: 42rem;
  color: rgba(255, 255, 255, 0.82);
}

.patient-care-events-page__summary {
  display: flex;
}

.patient-care-events-page__filters {
  display: grid;
  gap: 1rem;
  padding: 1rem;
  border: 1px solid rgba(20, 50, 63, 0.08);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.9);
}

.patient-care-events-page__filter-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.85rem;
}

.patient-care-events-page__filter-actions,
.patient-care-events-page__pagination {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.75rem;
}

.patient-care-events-page__list {
  display: grid;
  gap: 1rem;
}

.patient-care-events-page__event,
.patient-care-events-page__empty {
  padding: 1.4rem;
  border: 1px solid rgba(20, 50, 63, 0.08);
  border-radius: 1.35rem;
  background: rgba(255, 255, 255, 0.88);
}

.patient-care-events-page__event-main,
.patient-care-events-page__event-actions {
  display: grid;
  gap: 1rem;
}

.patient-care-events-page__event-main {
  flex: 1;
}

.patient-care-events-page__event-title-row {
  align-items: center;
}

.patient-care-events-page__event-title {
  color: #16313f;
  font-size: 1.35rem;
}

.patient-care-events-page__event-copy {
  color: #415463;
}

.patient-care-events-page__event-meta-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.85rem;
}

.patient-care-events-page__event-meta {
  padding: 0.85rem 1rem;
  border-radius: 1rem;
  background: #f7f1e8;
  color: #284455;
}

.patient-care-events-page__event-meta span {
  display: block;
  margin-bottom: 0.25rem;
  color: #9a5c2b;
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.patient-care-events-page__related-links {
  justify-content: flex-start;
  flex-wrap: wrap;
}

.care-event-report-dialog {
  width: min(42rem, calc(100vw - 2rem));
  border-radius: 8px;
}

.care-event-report-dialog__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.care-event-report-dialog__title {
  margin: 0;
  color: #16313f;
  font-size: 1.25rem;
}

.care-event-report-dialog__body {
  display: grid;
  gap: 1rem;
}

@media (max-width: 900px) {
  .patient-care-events-page__header,
  .patient-care-events-page__event-head {
    flex-direction: column;
  }

  .patient-care-events-page__filter-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .patient-care-events-page__actions {
    width: 100%;
    justify-content: flex-start;
    flex-wrap: wrap;
  }
}

@media (max-width: 720px) {
  .patient-care-events-page__filter-grid {
    grid-template-columns: 1fr;
  }

  .patient-care-events-page__filter-actions,
  .patient-care-events-page__pagination {
    justify-content: flex-start;
    flex-wrap: wrap;
  }

  .patient-care-events-page__event-meta-grid {
    grid-template-columns: 1fr;
  }
}
</style>
