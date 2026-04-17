<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";

import { getCareEventRequest } from "../../care-events/api";
import type { CareEventRecord } from "../../care-events/types";
import { listDocumentsRequest } from "../../documents/api";
import type { DocumentRecord } from "../../documents/types";
import { filterDocumentsByRelatedEntity } from "../../documents/utils";
import TimelineCareEventDialog from "../components/TimelineCareEventDialog.vue";
import { usePatientsStore } from "../store";
import {
  patientTimelineEventTypes,
  type GlobalTimelineRecord,
  type PatientTimelineRecord,
} from "../types";

const router = useRouter();
const { d, t } = useI18n();

const patientsStore = usePatientsStore();

const filters = reactive({
  patientSearch: "" as string | null,
  eventType: null as string | null,
});
const errorMessage = ref("");
const isCareEventDialogLoading = ref(false);
const isCareEventDialogOpen = ref(false);
const careEventDialogError = ref("");
const selectedCareEvent = ref<CareEventRecord | null>(null);
const selectedCareEventPatientName = ref("");
const selectedCareEventDocuments = ref<DocumentRecord[]>([]);

const careEventsById = new Map<string, CareEventRecord>();
const documentsByPatientId = new Map<string, DocumentRecord[]>();

const isLoading = computed(() => patientsStore.status === "loading");
const timeline = computed(() => patientsStore.globalTimeline);

const eventTypeConfig: Record<string, { color: string; bgColor: string; icon: string; label: string }> = {
  booking: { 
    color: "#4d7ea8", 
    bgColor: "#e8f4fc",
    icon: "event", 
    label: t("timeline.eventTypes.booking") 
  },
  care_event: { 
    color: "#6c8f7d", 
    bgColor: "#e8f3ef",
    icon: "medical_services", 
    label: t("timeline.eventTypes.care_event") 
  },
  document: { 
    color: "#cf7c4c", 
    bgColor: "#fdf2ec",
    icon: "description", 
    label: t("timeline.eventTypes.document") 
  },
  medical_instruction: { 
    color: "#28536b", 
    bgColor: "#e8f0f3",
    icon: "assignment", 
    label: t("timeline.eventTypes.medical_instruction") 
  },
  medication: { 
    color: "#3f8f72", 
    bgColor: "#e8f5f0",
    icon: "medication", 
    label: t("timeline.eventTypes.medication") 
  },
  prescription: { 
    color: "#d2a24c", 
    bgColor: "#fcf8ec",
    icon: "receipt", 
    label: t("timeline.eventTypes.prescription") 
  },
  task: { 
    color: "#b7503f", 
    bgColor: "#fdf0ee",
    icon: "check_circle", 
    label: t("timeline.eventTypes.task") 
  },
};

const filteredTimeline = computed(() => {
  const normalizedPatientSearch = (filters.patientSearch ?? "")
    .trim()
    .toLocaleLowerCase();

  return timeline.value.filter((entry) => {
    if (filters.eventType && entry.type !== filters.eventType) {
      return false;
    }

    if (
      normalizedPatientSearch &&
      !entry.patient.fullName.toLocaleLowerCase().includes(normalizedPatientSearch)
    ) {
      return false;
    }

    return true;
  });
});

const sortedTimeline = computed(() => {
  return [...filteredTimeline.value].sort((a, b) => 
    new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime()
  );
});

const uniqueDates = computed(() => {
  const dates = new Set<string>();
  sortedTimeline.value.forEach(item => {
    dates.add(item.eventDate.slice(0, 10));
  });
  return [...dates].sort();
});

const eventTypeCounts = computed(() => {
  const counts = new Map<string, number>();

  for (const eventType of patientTimelineEventTypes) {
    counts.set(eventType, 0);
  }

  for (const item of filteredTimeline.value) {
    counts.set(item.type, (counts.get(item.type) ?? 0) + 1);
  }

  return patientTimelineEventTypes
    .filter((type) => counts.get(type) ?? 0 > 0)
    .map((type) => ({
      count: counts.get(type) ?? 0,
      type,
      ...eventTypeConfig[type],
    }));
});

const loadPage = async () => {
  errorMessage.value = "";

  try {
    await patientsStore.loadGlobalTimeline();
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : t("globalTimeline.genericError");
  }
};

watch(
  () => true,
  async () => {
    await loadPage();
  },
  { immediate: true, once: true },
);

function formatDate(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`);
  return d(date, "short");
}

function formatTime(dateTimeStr: string): string {
  return d(new Date(dateTimeStr), "time");
}

function getEventConfig(type: string) {
  return eventTypeConfig[type] ?? { 
    color: "#6c757d", 
    bgColor: "#f5f5f5",
    icon: "circle", 
    label: type 
  };
}

function openPatient(patientId: string) {
  void router.push(`/app/patients/${patientId}/overview`);
}

async function openCareEventDialog(entry: GlobalTimelineRecord) {
  const targetPatientId = entry.patient.id;
  careEventDialogError.value = "";
  isCareEventDialogLoading.value = true;
  isCareEventDialogOpen.value = true;
  selectedCareEvent.value = null;
  selectedCareEventDocuments.value = [];
  selectedCareEventPatientName.value = entry.patient.fullName;

  try {
    const cachedCareEvent = careEventsById.get(entry.relatedEntity.id);
    let documents = documentsByPatientId.get(targetPatientId);

    if (!cachedCareEvent) {
      const careEvent = await getCareEventRequest(entry.relatedEntity.id);
      careEventsById.set(entry.relatedEntity.id, careEvent);
      selectedCareEvent.value = careEvent;
    } else {
      selectedCareEvent.value = cachedCareEvent;
    }

    if (!documents) {
      documents = await listDocumentsRequest(targetPatientId);
      documentsByPatientId.set(targetPatientId, documents);
    }

    selectedCareEventDocuments.value = filterDocumentsByRelatedEntity(
      documents,
      "care_event",
      entry.relatedEntity.id,
    );

    if (!selectedCareEvent.value) {
      careEventDialogError.value = t("timeline.careEventNotFound");
    }
  } catch (error) {
    careEventDialogError.value =
      error instanceof Error ? error.message : t("timeline.genericError");
  } finally {
    isCareEventDialogLoading.value = false;
  }
}

function openSourceRecord(entry: GlobalTimelineRecord) {
  const timelineItem: PatientTimelineRecord = {
    eventDate: entry.eventDate,
    id: entry.id,
    patientId: entry.patient.id,
    relatedEntity: entry.relatedEntity,
    summary: entry.summary,
    type: entry.type,
  };

  if (timelineItem.relatedEntity.type === "medical_instruction") {
    void router.push(
      `/app/patients/${entry.patient.id}/instructions/${timelineItem.relatedEntity.id}`,
    );
    return;
  }

  const hashTargets: Record<string, string> = {
    booking: `#booking-${timelineItem.relatedEntity.id}`,
    care_event: `#care-event-${timelineItem.relatedEntity.id}`,
    document: "#documents-section",
    medication: "#patient-medications-section",
    prescription: `#prescription-${timelineItem.relatedEntity.id}`,
    task: `#task-${timelineItem.relatedEntity.id}`,
  };

  const hash = hashTargets[timelineItem.relatedEntity.type];

  if (hash) {
    void router.push({
      hash,
      path: `/app/patients/${entry.patient.id}/overview`,
    });
    return;
  }

  void router.push(`/app/patients/${entry.patient.id}/overview`);
}

function handleTimelineEventClick(entry: GlobalTimelineRecord) {
  if (entry.relatedEntity.type === "care_event") {
    void openCareEventDialog(entry);
    return;
  }

  openSourceRecord(entry);
}

function clearFilters() {
  filters.eventType = null;
  filters.patientSearch = "";
}

function getEventLeftPercent(eventDate: string): number {
  const dateKey = eventDate.slice(0, 10);
  const index = uniqueDates.value.indexOf(dateKey);
  if (uniqueDates.value.length <= 1) return 50;
  return (index / (uniqueDates.value.length - 1)) * 100;
}
</script>

<template>
  <q-page class="horizontal-timeline-page">
    <q-banner
      v-if="errorMessage"
      rounded
      class="horizontal-timeline-page__banner"
    >
      <template #avatar>
        <q-icon name="error" color="negative" />
      </template>
      {{ errorMessage }}
    </q-banner>

    <div class="horizontal-timeline-page__header">
      <div class="horizontal-timeline-page__header-main">
        <div>
          <h1 class="horizontal-timeline-page__title">{{ $t("globalTimeline.title") }}</h1>
          <p class="horizontal-timeline-page__subtitle">{{ $t("globalTimeline.description") }}</p>
        </div>

        <q-input
          v-model="filters.patientSearch"
          outlined
          dense
          clearable
          :label="$t('globalTimeline.filters.patientLabel')"
          :placeholder="$t('globalTimeline.filters.patientPlaceholder')"
          class="horizontal-timeline-page__search"
        >
          <template #prepend>
            <q-icon name="search" size="1rem" />
          </template>
        </q-input>
      </div>

      <div class="horizontal-timeline-page__filters">
        <div
          v-for="stat in eventTypeCounts"
          :key="stat.type"
          class="horizontal-timeline-page__filter-chip"
          :class="{ 'horizontal-timeline-page__filter-chip--active': filters.eventType === stat.type }"
          :style="{ 
            backgroundColor: filters.eventType === stat.type ? stat.color : stat.bgColor,
            color: filters.eventType === stat.type ? '#fff' : stat.color,
            borderColor: stat.color
          }"
          @click="filters.eventType = filters.eventType === stat.type ? null : stat.type"
        >
          <q-icon :name="stat.icon" size="1rem" />
          <span>{{ stat.label }}</span>
          <span class="horizontal-timeline-page__filter-count">{{ stat.count }}</span>
        </div>
        <q-btn
          v-if="filters.eventType || filters.patientSearch"
          flat
          dense
          color="grey-7"
          icon="filter_alt_off"
          :label="$t('common.clear')"
          @click="clearFilters"
        />
      </div>
    </div>

    <div
      v-if="isLoading"
      class="horizontal-timeline-page__loading"
    >
      <q-spinner color="primary" size="3rem" />
    </div>

    <div
      v-else-if="sortedTimeline.length === 0"
      class="horizontal-timeline-page__empty"
    >
      <q-icon name="timeline" size="5rem" color="grey-4" />
      <h2 class="horizontal-timeline-page__empty-title">{{ $t("globalTimeline.emptyTitle") }}</h2>
      <p class="horizontal-timeline-page__empty-text">{{ $t("globalTimeline.emptyDescription") }}</p>
    </div>

    <div
      v-else
      class="horizontal-timeline-page__content"
    >
      <div class="horizontal-timeline-page__timeline-wrapper">
        <!-- Events Above Timeline -->
        <div class="horizontal-timeline-page__events-above">
          <div
            v-for="(event, index) in sortedTimeline.filter((_, i) => i % 2 === 0)"
            :key="event.id"
            class="horizontal-timeline-page__event-wrapper horizontal-timeline-page__event-wrapper--top"
            :style="{ left: getEventLeftPercent(event.eventDate) + '%' }"
          >
            <div class="horizontal-timeline-page__event-card-wrapper">
              <q-card
                flat
                class="horizontal-timeline-page__event-card"
                :style="{ borderColor: getEventConfig(event.type).color }"
                @click="handleTimelineEventClick(event)"
              >
                <div class="horizontal-timeline-page__event-header">
                  <div
                    class="horizontal-timeline-page__event-icon"
                    :style="{ backgroundColor: getEventConfig(event.type).color }"
                  >
                    <q-icon :name="getEventConfig(event.type).icon" size="1.25rem" color="white" />
                  </div>
                  <div class="horizontal-timeline-page__event-meta">
                    <span class="horizontal-timeline-page__event-type">{{ getEventConfig(event.type).label }}</span>
                    <span class="horizontal-timeline-page__event-date">{{ formatDate(event.eventDate.slice(0, 10)) }}</span>
                  </div>
                </div>
                <div class="horizontal-timeline-page__event-patient">
                  <q-icon name="person" size="0.75rem" color="grey-5" />
                  <span>{{ event.patient.fullName }}</span>
                </div>
                <p class="horizontal-timeline-page__event-summary">{{ event.summary }}</p>
                <span class="horizontal-timeline-page__event-time">{{ formatTime(event.eventDate) }}</span>
              </q-card>
            </div>
            <div class="horizontal-timeline-page__connector-line" />
          </div>
        </div>

        <!-- Central Timeline Bar -->
        <div class="horizontal-timeline-page__timeline-bar">
          <div class="horizontal-timeline-page__timeline-track">
            <div 
              v-for="(date, index) in uniqueDates" 
              :key="date"
              class="horizontal-timeline-page__timeline-marker"
              :style="{ left: (index / (uniqueDates.length - 1)) * 100 + '%' }"
            >
              <div class="horizontal-timeline-page__timeline-dot" />
              <span class="horizontal-timeline-page__timeline-date">{{ formatDate(date) }}</span>
            </div>
          </div>
        </div>

        <!-- Events Below Timeline -->
        <div class="horizontal-timeline-page__events-below">
          <div
            v-for="(event, index) in sortedTimeline.filter((_, i) => i % 2 === 1)"
            :key="event.id"
            class="horizontal-timeline-page__event-wrapper horizontal-timeline-page__event-wrapper--bottom"
            :style="{ left: getEventLeftPercent(event.eventDate) + '%' }"
          >
            <div class="horizontal-timeline-page__connector-line" />
            <div class="horizontal-timeline-page__event-card-wrapper">
              <q-card
                flat
                class="horizontal-timeline-page__event-card"
                :style="{ borderColor: getEventConfig(event.type).color }"
                @click="handleTimelineEventClick(event)"
              >
                <div class="horizontal-timeline-page__event-header">
                  <div
                    class="horizontal-timeline-page__event-icon"
                    :style="{ backgroundColor: getEventConfig(event.type).color }"
                  >
                    <q-icon :name="getEventConfig(event.type).icon" size="1.25rem" color="white" />
                  </div>
                  <div class="horizontal-timeline-page__event-meta">
                    <span class="horizontal-timeline-page__event-type">{{ getEventConfig(event.type).label }}</span>
                    <span class="horizontal-timeline-page__event-date">{{ formatDate(event.eventDate.slice(0, 10)) }}</span>
                  </div>
                </div>
                <div class="horizontal-timeline-page__event-patient">
                  <q-icon name="person" size="0.75rem" color="grey-5" />
                  <span>{{ event.patient.fullName }}</span>
                </div>
                <p class="horizontal-timeline-page__event-summary">{{ event.summary }}</p>
                <span class="horizontal-timeline-page__event-time">{{ formatTime(event.eventDate) }}</span>
              </q-card>
            </div>
          </div>
        </div>
      </div>
    </div>

    <TimelineCareEventDialog
      v-model="isCareEventDialogOpen"
      :care-event="selectedCareEvent"
      :documents="selectedCareEventDocuments"
      :error-message="careEventDialogError"
      :loading="isCareEventDialogLoading"
      :patient-name="selectedCareEventPatientName"
    />
  </q-page>
</template>

<style scoped>
.horizontal-timeline-page {
  padding: 1.5rem;
  min-height: 100vh;
}

.horizontal-timeline-page__banner {
  margin-bottom: 1rem;
  background: rgba(183, 80, 63, 0.1);
  border: 1px solid rgba(183, 80, 63, 0.2);
  border-radius: 0.75rem;
}

.horizontal-timeline-page__header {
  margin-bottom: 2rem;
}

.horizontal-timeline-page__header-main {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
}

.horizontal-timeline-page__title {
  margin: 0;
  color: #14323f;
  font-size: 1.75rem;
  font-weight: 600;
}

.horizontal-timeline-page__subtitle {
  margin: 0.25rem 0 0;
  color: #6c757d;
  font-size: 0.9375rem;
  max-width: 600px;
}

.horizontal-timeline-page__search {
  min-width: 250px;
  max-width: 300px;
}

.horizontal-timeline-page__filters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}

.horizontal-timeline-page__filter-chip {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.75rem;
  border: 1px solid;
  border-radius: 2rem;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.horizontal-timeline-page__filter-chip:hover {
  opacity: 0.8;
}

.horizontal-timeline-page__filter-count {
  padding: 0.125rem 0.5rem;
  background: rgba(0, 0, 0, 0.1);
  border-radius: 1rem;
  font-size: 0.75rem;
  font-weight: 600;
}

.horizontal-timeline-page__loading {
  display: flex;
  justify-content: center;
  padding: 4rem;
}

.horizontal-timeline-page__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 4rem 2rem;
  gap: 1rem;
}

.horizontal-timeline-page__empty-title {
  margin: 0;
  color: #14323f;
  font-size: 1.25rem;
  font-weight: 600;
}

.horizontal-timeline-page__empty-text {
  margin: 0;
  color: #6c757d;
  font-size: 0.9375rem;
  max-width: 400px;
}

.horizontal-timeline-page__content {
  overflow-x: auto;
  padding: 2rem 0;
}

.horizontal-timeline-page__timeline-wrapper {
  position: relative;
  min-width: 800px;
  padding: 0 2rem;
}

/* Events Above Timeline */
.horizontal-timeline-page__events-above {
  position: relative;
  height: 220px;
  margin-bottom: 1rem;
}

/* Events Below Timeline */
.horizontal-timeline-page__events-below {
  position: relative;
  height: 220px;
  margin-top: 1rem;
}

.horizontal-timeline-page__event-wrapper {
  position: absolute;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 280px;
}

.horizontal-timeline-page__event-wrapper--top {
  bottom: 0;
}

.horizontal-timeline-page__event-wrapper--bottom {
  top: 0;
}

.horizontal-timeline-page__event-card-wrapper {
  width: 100%;
}

.horizontal-timeline-page__event-card {
  padding: 1rem;
  background: #ffffff;
  border: 2px solid;
  border-radius: 1rem;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.horizontal-timeline-page__event-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}

.horizontal-timeline-page__event-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}

.horizontal-timeline-page__event-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 50%;
  flex-shrink: 0;
}

.horizontal-timeline-page__event-meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.horizontal-timeline-page__event-type {
  color: #14323f;
  font-size: 0.875rem;
  font-weight: 600;
}

.horizontal-timeline-page__event-date {
  color: #6c757d;
  font-size: 0.75rem;
}

.horizontal-timeline-page__event-patient {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  margin-bottom: 0.5rem;
  color: #28536b;
  font-size: 0.8125rem;
  font-weight: 500;
}

.horizontal-timeline-page__event-patient span {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.horizontal-timeline-page__event-summary {
  margin: 0 0 0.5rem;
  color: #4b646f;
  font-size: 0.9375rem;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.horizontal-timeline-page__event-time {
  color: #9ca3af;
  font-size: 0.75rem;
  font-weight: 500;
}

.horizontal-timeline-page__connector-line {
  width: 2px;
  height: 24px;
  background: linear-gradient(180deg, #d1d5db, #9ca3af);
}

.horizontal-timeline-page__event-wrapper--top .horizontal-timeline-page__connector-line {
  margin-top: 0.5rem;
}

.horizontal-timeline-page__event-wrapper--bottom .horizontal-timeline-page__connector-line {
  margin-bottom: 0.5rem;
}

/* Central Timeline Bar */
.horizontal-timeline-page__timeline-bar {
  position: relative;
  height: 60px;
  display: flex;
  align-items: center;
}

.horizontal-timeline-page__timeline-track {
  position: relative;
  width: 100%;
  height: 8px;
  background: linear-gradient(90deg, #e5e7eb, #d1d5db, #e5e7eb);
  border-radius: 4px;
}

.horizontal-timeline-page__timeline-marker {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}

.horizontal-timeline-page__timeline-dot {
  width: 16px;
  height: 16px;
  background: #ffffff;
  border: 3px solid #28536b;
  border-radius: 50%;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
}

.horizontal-timeline-page__timeline-date {
  color: #6b7280;
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
}

@media (max-width: 768px) {
  .horizontal-timeline-page__content {
    padding: 1rem 0;
  }

  .horizontal-timeline-page__timeline-wrapper {
    min-width: 600px;
    padding: 0 1rem;
  }

  .horizontal-timeline-page__event-wrapper {
    width: 220px;
  }

  .horizontal-timeline-page__events-above,
  .horizontal-timeline-page__events-below {
    height: 180px;
  }
}
</style>
