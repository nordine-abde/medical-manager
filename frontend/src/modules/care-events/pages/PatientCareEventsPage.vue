<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";

import { useBookingsStore } from "../../bookings/store";
import { useDocumentsStore } from "../../documents/store";
import type { DocumentRecord, DocumentType } from "../../documents/types";
import { useInstructionsStore } from "../../instructions/store";
import type { InstructionRecord, InstructionUpsertPayload } from "../../instructions/types";
import { useTasksStore } from "../../tasks/store";
import type { TaskUpsertPayload } from "../../tasks/types";
import { usePatientsStore } from "../../patients/store";
import CareEventFormDialog from "../components/CareEventFormDialog.vue";
import { useCareEventsStore } from "../store";
import type {
  CareEventListFilters,
  CareEventRecord,
  CareEventType,
  CareEventUpsertPayload,
} from "../types";
import { careEventTypes } from "../types";
import type { FacilityUpsertPayload } from "../../bookings/types";

const route = useRoute();
const router = useRouter();
const { d, t } = useI18n();

const patientsStore = usePatientsStore();
const tasksStore = useTasksStore();
const bookingsStore = useBookingsStore();
const documentsStore = useDocumentsStore();
const instructionsStore = useInstructionsStore();
const careEventsStore = useCareEventsStore();

const isLoading = ref(false);
const isSaving = ref(false);
const isFormOpen = ref(false);
const editingCareEvent = ref<CareEventRecord | null>(null);
const errorMessage = ref("");
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

const patientId = computed(() => route.params.patientId as string);
const patient = computed(() => patientsStore.currentPatient);
const tasks = computed(() => tasksStore.activeTasks);
const bookings = computed(() => bookingsStore.activeBookings);
const facilities = computed(() => bookingsStore.facilities);
const instructions = computed(() => instructionsStore.instructions);
const careEvents = computed(() => careEventsStore.careEvents);
const pagination = computed(() => careEventsStore.pagination);
const documents = computed(() => documentsStore.documents);
const careEventSubtypeOptionsByType = computed(
  () => careEventsStore.subtypesByType,
);
const instructionsByCareEventId = computed(() => {
  const grouped = new Map<string, InstructionRecord[]>();

  for (const instruction of instructions.value) {
    if (!instruction.careEventId) {
      continue;
    }

    const currentItems = grouped.get(instruction.careEventId) ?? [];
    currentItems.push(instruction);
    grouped.set(instruction.careEventId, currentItems);
  }

  return grouped;
});

const taskOptions = computed(() =>
  tasks.value.map((task) => ({
    label: `${task.title} · ${task.taskType}`,
    value: task.id,
  })),
);

const bookingOptions = computed(() =>
  bookings.value.map((booking) => ({
    label: [
      resolveBookingTaskLabel(booking.taskId),
      formatDateTime(booking.appointmentAt ?? booking.bookedAt),
    ].join(" · "),
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
      tasksStore.loadTasks(patientId.value),
      bookingsStore.loadBookings(patientId.value),
      bookingsStore.loadFacilities(),
      documentsStore.loadDocuments(patientId.value),
      instructionsStore.loadInstructions(patientId.value),
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

const formatDateTime = (value: string | null) => {
  if (!value) {
    return t("careEvents.emptyDate");
  }

  return d(new Date(value), "short");
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

const resolveTaskLabel = (taskId: string | null) => {
  if (!taskId) {
    return t("careEvents.unlinkedTask");
  }

  const task = tasks.value.find((item) => item.id === taskId);

  if (!task) {
    return t("careEvents.missingTask");
  }

  return `${task.title} · ${task.taskType}`;
};

const resolveBookingTaskLabel = (taskId: string) => {
  const task = tasks.value.find((item) => item.id === taskId);

  if (!task) {
    return t("careEvents.missingTask");
  }

  return `${task.title} · ${task.taskType}`;
};

const resolveBookingLabel = (bookingId: string | null) => {
  if (!bookingId) {
    return t("careEvents.unlinkedBooking");
  }

  const booking = bookings.value.find((item) => item.id === bookingId);

  if (!booking) {
    return t("careEvents.missingBooking");
  }

  return [
    resolveBookingTaskLabel(booking.taskId),
    formatDateTime(booking.appointmentAt ?? booking.bookedAt),
  ].join(" · ");
};

const resolveInstructionList = (careEventId: string): InstructionRecord[] =>
  instructionsByCareEventId.value.get(careEventId) ?? [];

const resolveDocumentsList = (careEventId: string): DocumentRecord[] =>
  documents.value.filter(
    (document) =>
      document.relatedEntityType === "care_event" &&
      document.relatedEntityId === careEventId,
  );

const resolveCareEventTitle = (careEvent: CareEventRecord): string => {
  const titleParts = [t(`careEvents.types.${careEvent.eventType}`)];
  const subtype = careEvent.subtype?.trim();

  if (subtype) {
    titleParts.push(subtype);
  }

  titleParts.push(formatDateTime(careEvent.completedAt));

  return titleParts.join(" · ");
};

const openCreateDialog = () => {
  editingCareEvent.value = null;
  isFormOpen.value = true;
};

const openEditDialog = (careEvent: CareEventRecord) => {
  editingCareEvent.value = careEvent;
  isFormOpen.value = true;
};

const handleDialogModelChange = (value: boolean) => {
  isFormOpen.value = value;

  if (!value) {
    editingCareEvent.value = null;
  }
};

const createInstructionAndTask = async (
  careEventId: string,
  instructionPayload: InstructionUpsertPayload | null,
  taskPayload: TaskUpsertPayload | null,
): Promise<string | null> => {
  if (!instructionPayload) {
    return null;
  }

  const createdInstruction = await instructionsStore.createInstruction(
    patientId.value,
    {
      ...instructionPayload,
      careEventId,
    },
  );

  if (!taskPayload) {
    return null;
  }

  const createdTask = await tasksStore.createTask(patientId.value, {
    ...taskPayload,
    medicalInstructionId: createdInstruction.id,
  });

  return createdTask.id;
};

const handleSubmit = async (payload: {
  careEvent: CareEventUpsertPayload;
  facilityPayload: FacilityUpsertPayload | null;
  inlineInstruction: InstructionUpsertPayload | null;
  inlineTask: TaskUpsertPayload | null;
  attachedDocument: {
    documentType: DocumentType;
    file: File;
    notes: string | null;
  } | null;
}) => {
  isSaving.value = true;
  errorMessage.value = "";

  try {
    let facilityId = payload.careEvent.facilityId;

    if (payload.facilityPayload) {
      const createdFacility = await bookingsStore.createFacility(
        payload.facilityPayload,
      );
      facilityId = createdFacility.id;
    }

    if (editingCareEvent.value) {
      const createdTaskId = await createInstructionAndTask(
        editingCareEvent.value.id,
        payload.inlineInstruction,
        payload.inlineTask,
      );

      await careEventsStore.updateCareEvent(editingCareEvent.value.id, {
        ...payload.careEvent,
        facilityId,
        taskId: createdTaskId ?? payload.careEvent.taskId,
      });

      if (payload.attachedDocument) {
        await documentsStore.uploadDocument(patientId.value, {
          documentType: payload.attachedDocument.documentType,
          file: payload.attachedDocument.file,
          notes: payload.attachedDocument.notes,
          relatedEntityId: editingCareEvent.value.id,
          relatedEntityType: "care_event",
        });
      }
    } else {
      const createdCareEvent = await careEventsStore.createCareEvent(
        patientId.value,
        {
          ...payload.careEvent,
          facilityId,
        },
      );
      const createdTaskId = await createInstructionAndTask(
        createdCareEvent.id,
        payload.inlineInstruction,
        payload.inlineTask,
      );

      if (createdTaskId) {
        await careEventsStore.updateCareEvent(createdCareEvent.id, {
          taskId: createdTaskId,
        });
      }

      if (payload.attachedDocument) {
        await documentsStore.uploadDocument(patientId.value, {
          documentType: payload.attachedDocument.documentType,
          file: payload.attachedDocument.file,
          notes: payload.attachedDocument.notes,
          relatedEntityId: createdCareEvent.id,
          relatedEntityType: "care_event",
        });
      }
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

const openInstructionDetail = async (instructionId: string) => {
  await router.push(
    `/app/patients/${patientId.value}/instructions/${instructionId}`,
  );
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
                    <span>{{ $t("careEvents.fields.task") }}</span>
                    {{ resolveTaskLabel(careEvent.taskId) }}
                  </p>
                  <p class="patient-care-events-page__event-meta">
                    <span>{{ $t("careEvents.fields.booking") }}</span>
                    {{ resolveBookingLabel(careEvent.bookingId) }}
                  </p>
                </div>

                <div
                  v-if="
                    careEvent.taskId ||
                    careEvent.bookingId ||
                    resolveInstructionList(careEvent.id).length ||
                    resolveDocumentsList(careEvent.id).length
                  "
                  class="patient-care-events-page__related-links"
                >
                  <q-btn
                    v-for="instruction in resolveInstructionList(careEvent.id)"
                    :key="instruction.id"
                    flat
                    color="secondary"
                    icon="description"
                    no-caps
                    :label="
                      instruction.specialty || $t('careEvents.openInstructionLink')
                    "
                    @click="openInstructionDetail(instruction.id)"
                  />
                  <q-btn
                    v-if="careEvent.taskId"
                    flat
                    color="primary"
                    icon="task_alt"
                    no-caps
                    :label="$t('careEvents.openTaskLink')"
                    @click="openOverviewAnchor(`#task-${careEvent.taskId}`)"
                  />
                  <q-btn
                    v-if="careEvent.bookingId"
                    flat
                    color="accent"
                    icon="event"
                    no-caps
                    :label="$t('careEvents.openBookingLink')"
                    @click="openOverviewAnchor(`#booking-${careEvent.bookingId}`)"
                  />
                  <q-btn
                    v-for="document in resolveDocumentsList(careEvent.id)"
                    :key="document.id"
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
      :task-options="taskOptions"
      :title="
        editingCareEvent
          ? $t('careEvents.editTitle')
          : $t('careEvents.createTitle')
      "
      @submit="handleSubmit"
      @update:model-value="handleDialogModelChange"
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
