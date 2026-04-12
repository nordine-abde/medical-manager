<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";

import { globalTaskStates, type GlobalTaskRecord, type TaskRecord } from "../types";
import { useTasksStore } from "../store";

interface TaskGroup {
  patientId: string;
  patientName: string;
  tasks: GlobalTaskRecord[];
}

const router = useRouter();
const tasksStore = useTasksStore();
const { d, t } = useI18n();

const filters = reactive({
  includeArchived: false,
  patientSearch: "" as string | null,
  state: "" as "" | (typeof globalTaskStates)[number],
});
const errorMessage = ref("");
const mutatingTaskId = ref("");

const isLoading = computed(() => tasksStore.globalStatus === "loading");
const globalTasks = computed(() => tasksStore.globalTasks);

const stateOptions = computed(() => [
  {
    label: t("tasks.workspace.filters.stateAll"),
    value: "",
  },
  ...globalTaskStates.map((state) => ({
    label: t(`tasks.workspace.states.${state}`),
    value: state,
  })),
]);

const filteredTasks = computed(() => {
  const normalizedSearch = (filters.patientSearch ?? "")
    .trim()
    .toLocaleLowerCase();

  if (!normalizedSearch) {
    return globalTasks.value;
  }

  return globalTasks.value.filter((entry) =>
    entry.patient.fullName.toLocaleLowerCase().includes(normalizedSearch),
  );
});

const groupedTasks = computed<TaskGroup[]>(() => {
  const groups = new Map<string, TaskGroup>();

  for (const entry of filteredTasks.value) {
    const existingGroup = groups.get(entry.patient.id);

    if (existingGroup) {
      existingGroup.tasks.push(entry);
      continue;
    }

    groups.set(entry.patient.id, {
      patientId: entry.patient.id,
      patientName: entry.patient.fullName,
      tasks: [entry],
    });
  }

  return [...groups.values()].sort((left, right) =>
    left.patientName.localeCompare(right.patientName),
  );
});

const summaryCounts = computed(() => {
  const counts = {
    blocked: 0,
    completed: 0,
    overdue: 0,
    pending: 0,
    upcoming: 0,
  };

  for (const entry of filteredTasks.value) {
    const task = entry.task;

    if (task.status === "blocked") {
      counts.blocked += 1;
      continue;
    }

    if (task.status === "completed") {
      counts.completed += 1;
      continue;
    }

    if (task.dueDate && task.dueDate < todayDate()) {
      counts.overdue += 1;
      continue;
    }

    if (task.status === "scheduled") {
      counts.upcoming += 1;
      continue;
    }

    counts.pending += 1;
  }

  return counts;
});

const loadPage = async () => {
  errorMessage.value = "";

  try {
    await tasksStore.loadGlobalTasks({
      includeArchived: filters.includeArchived,
      ...(filters.state ? { state: filters.state } : {}),
    });
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : t("tasks.genericError");
  }
};

watch(
  [() => filters.includeArchived, () => filters.state],
  async () => {
    await loadPage();
  },
  { immediate: true },
);

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value: string | null): string {
  if (!value) {
    return t("tasks.emptyDate");
  }

  return d(new Date(`${value}T00:00:00`), "short");
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return t("tasks.emptyDate");
  }

  return d(new Date(value), "short");
}

function resolveVisibleStatus(task: TaskRecord): string {
  if (task.status === "blocked") {
    return "blocked";
  }

  if (task.status === "completed") {
    return "completed";
  }

  if (task.dueDate && task.dueDate < todayDate()) {
    return "overdue";
  }

  if (task.status === "scheduled") {
    return "upcoming";
  }

  return "pending";
}

function resolveStatusColor(task: TaskRecord): string {
  const visibleStatus = resolveVisibleStatus(task);

  if (visibleStatus === "overdue") {
    return "negative";
  }

  if (visibleStatus === "blocked") {
    return "warning";
  }

  if (visibleStatus === "completed") {
    return "positive";
  }

  if (visibleStatus === "upcoming") {
    return "secondary";
  }

  return "primary";
}

function canMarkComplete(task: TaskRecord): boolean {
  return task.status !== "completed" && task.status !== "cancelled";
}

function canReopen(task: TaskRecord): boolean {
  return task.status === "completed";
}

function isMutatingTask(taskId: string): boolean {
  return mutatingTaskId.value === taskId;
}

async function handleStatusChange(
  task: TaskRecord,
  nextStatus: "completed" | "pending",
) {
  mutatingTaskId.value = task.id;
  errorMessage.value = "";

  try {
    await tasksStore.changeTaskStatus(task.id, nextStatus);
    await tasksStore.refreshGlobalTasks();
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : t("tasks.genericError");
  } finally {
    mutatingTaskId.value = "";
  }
}

function openPatient(patientId: string) {
  void router.push(`/app/patients/${patientId}/overview`);
}

function openTask(entry: GlobalTaskRecord) {
  void router.push(`/app/patients/${entry.patient.id}/overview#task-${entry.task.id}`);
}

function openSourceRecord(entry: GlobalTaskRecord) {
  if (entry.task.medicalInstructionId) {
    void router.push(
      `/app/patients/${entry.patient.id}/instructions/${entry.task.medicalInstructionId}`,
    );
    return;
  }

  openTask(entry);
}
</script>

<template>
  <q-page class="global-tasks-page">
    <q-banner
      v-if="errorMessage"
      rounded
      class="global-tasks-page__banner"
    >
      {{ errorMessage }}
    </q-banner>

    <q-card
      flat
      bordered
      class="global-tasks-page__hero"
    >
      <q-card-section class="global-tasks-page__hero-content">
        <div>
          <p class="global-tasks-page__eyebrow">
            {{ $t("tasks.workspace.eyebrow") }}
          </p>
          <h1 class="global-tasks-page__title">
            {{ $t("tasks.workspace.title") }}
          </h1>
          <p class="global-tasks-page__description">
            {{ $t("tasks.workspace.description") }}
          </p>
        </div>

        <div class="global-tasks-page__summary-grid">
          <q-card
            flat
            class="global-tasks-page__summary-card"
          >
            <p class="global-tasks-page__summary-label">
              {{ $t("tasks.workspace.states.pending") }}
            </p>
            <strong class="global-tasks-page__summary-value">
              {{ summaryCounts.pending }}
            </strong>
          </q-card>
          <q-card
            flat
            class="global-tasks-page__summary-card"
          >
            <p class="global-tasks-page__summary-label">
              {{ $t("tasks.workspace.states.overdue") }}
            </p>
            <strong class="global-tasks-page__summary-value">
              {{ summaryCounts.overdue }}
            </strong>
          </q-card>
          <q-card
            flat
            class="global-tasks-page__summary-card"
          >
            <p class="global-tasks-page__summary-label">
              {{ $t("tasks.workspace.states.blocked") }}
            </p>
            <strong class="global-tasks-page__summary-value">
              {{ summaryCounts.blocked }}
            </strong>
          </q-card>
          <q-card
            flat
            class="global-tasks-page__summary-card"
          >
            <p class="global-tasks-page__summary-label">
              {{ $t("tasks.workspace.states.completed") }}
            </p>
            <strong class="global-tasks-page__summary-value">
              {{ summaryCounts.completed }}
            </strong>
          </q-card>
        </div>
      </q-card-section>
    </q-card>

    <q-card
      flat
      bordered
      class="global-tasks-page__panel"
    >
      <q-card-section class="global-tasks-page__filters">
        <q-select
          v-model="filters.state"
          outlined
          emit-value
          map-options
          :label="$t('tasks.workspace.filters.stateLabel')"
          :options="stateOptions"
        />
        <q-input
          v-model="filters.patientSearch"
          outlined
          clearable
          :label="$t('tasks.workspace.filters.patientLabel')"
          :placeholder="$t('tasks.workspace.filters.patientPlaceholder')"
        >
          <template #prepend>
            <q-icon name="search" />
          </template>
        </q-input>
        <q-toggle
          v-model="filters.includeArchived"
          color="secondary"
          keep-color
          :label="$t('tasks.workspace.filters.includeArchived')"
        />
      </q-card-section>

      <q-card-section
        v-if="isLoading"
        class="global-tasks-page__loading"
      >
        <q-spinner
          color="primary"
          size="2.2rem"
        />
      </q-card-section>

      <q-card-section
        v-else-if="groupedTasks.length === 0"
        class="global-tasks-page__empty"
      >
        <p class="global-tasks-page__empty-eyebrow">
          {{ $t("tasks.workspace.emptyEyebrow") }}
        </p>
        <h2 class="global-tasks-page__empty-title">
          {{ $t("tasks.workspace.emptyTitle") }}
        </h2>
        <p class="global-tasks-page__empty-description">
          {{ $t("tasks.workspace.emptyDescription") }}
        </p>
      </q-card-section>

      <q-card-section
        v-else
        class="global-tasks-page__groups"
      >
        <section
          v-for="group in groupedTasks"
          :key="group.patientId"
          class="global-tasks-page__group"
        >
          <div class="global-tasks-page__group-header">
            <div>
              <p class="global-tasks-page__group-eyebrow">
                {{ $t("tasks.workspace.groupEyebrow") }}
              </p>
              <h2 class="global-tasks-page__group-title">
                {{ group.patientName }}
              </h2>
            </div>
            <q-btn
              flat
              color="primary"
              no-caps
              icon="open_in_new"
              :label="$t('tasks.workspace.actions.openPatient')"
              @click="openPatient(group.patientId)"
            />
          </div>

          <div class="global-tasks-page__task-list">
            <q-card
              v-for="entry in group.tasks"
              :key="entry.task.id"
              flat
              class="global-tasks-page__task-card"
            >
              <div class="global-tasks-page__task-main">
                <div class="global-tasks-page__task-head">
                  <div>
                    <div class="global-tasks-page__task-title-row">
                      <h3 class="global-tasks-page__task-title">
                        {{ entry.task.title }}
                      </h3>
                      <q-badge
                        rounded
                        :color="resolveStatusColor(entry.task)"
                        :text-color="
                          resolveVisibleStatus(entry.task) === 'blocked' ? 'dark' : 'white'
                        "
                        :label="$t(`tasks.workspace.states.${resolveVisibleStatus(entry.task)}`)"
                      />
                    </div>
                    <p class="global-tasks-page__task-type">
                      {{ $t('tasks.workspace.taskTypeLabel') }} · {{ entry.task.taskType }}
                    </p>
                  </div>
                  <div class="global-tasks-page__task-actions">
                    <q-btn
                      flat
                      color="primary"
                      no-caps
                      icon="account_box"
                      :label="$t('tasks.workspace.actions.openPatient')"
                      @click="openPatient(entry.patient.id)"
                    />
                    <q-btn
                      flat
                      color="dark"
                      no-caps
                      icon="ads_click"
                      :label="
                        entry.task.medicalInstructionId
                          ? $t('tasks.workspace.actions.openSource')
                          : $t('tasks.workspace.actions.openTask')
                      "
                      @click="openSourceRecord(entry)"
                    />
                    <q-btn
                      v-if="canMarkComplete(entry.task)"
                      :key="`${entry.task.id}-complete`"
                      flat
                      color="positive"
                      no-caps
                      icon="task_alt"
                      :loading="isMutatingTask(entry.task.id)"
                      :label="$t('tasks.workspace.actions.complete')"
                      @click="handleStatusChange(entry.task, 'completed')"
                    />
                    <q-btn
                      v-if="canReopen(entry.task)"
                      :key="`${entry.task.id}-reopen`"
                      flat
                      color="secondary"
                      no-caps
                      icon="restart_alt"
                      :loading="isMutatingTask(entry.task.id)"
                      :label="$t('tasks.workspace.actions.reopen')"
                      @click="handleStatusChange(entry.task, 'pending')"
                    />
                  </div>
                </div>

                <p class="global-tasks-page__task-description">
                  {{ entry.task.description || $t("tasks.emptyDescription") }}
                </p>

                <div class="global-tasks-page__task-meta-grid">
                  <p class="global-tasks-page__task-meta">
                    <span>{{ $t("tasks.fields.dueDate") }}</span>
                    {{ formatDate(entry.task.dueDate) }}
                  </p>
                  <p class="global-tasks-page__task-meta">
                    <span>{{ $t("tasks.fields.scheduledAt") }}</span>
                    {{ formatDateTime(entry.task.scheduledAt) }}
                  </p>
                  <p class="global-tasks-page__task-meta">
                    <span>{{ $t("tasks.fields.status") }}</span>
                    {{ $t(`tasks.statuses.${entry.task.status}`) }}
                  </p>
                  <p class="global-tasks-page__task-meta">
                    <span>{{ $t("tasks.workspace.patientLabel") }}</span>
                    {{ entry.patient.fullName }}
                  </p>
                </div>

                <p
                  v-if="entry.task.status === 'blocked'"
                  class="global-tasks-page__task-blocked"
                >
                  {{
                    $t("tasks.blockedReason", {
                      count: entry.task.blockedByTaskIds.length,
                    })
                  }}
                </p>
              </div>
            </q-card>
          </div>
        </section>
      </q-card-section>
    </q-card>
  </q-page>
</template>

<style scoped>
.global-tasks-page {
  display: grid;
  gap: 1.5rem;
}

.global-tasks-page__banner {
  background: rgba(183, 80, 63, 0.14);
  color: #7f2e22;
}

.global-tasks-page__hero,
.global-tasks-page__panel {
  border-radius: 1.5rem;
}

.global-tasks-page__hero {
  overflow: hidden;
  border-color: rgba(20, 50, 63, 0.08);
  background:
    linear-gradient(135deg, rgba(20, 50, 63, 0.97), rgba(52, 94, 83, 0.95)),
    radial-gradient(circle at top right, rgba(243, 195, 110, 0.18), transparent 35%);
  color: white;
}

.global-tasks-page__hero-content {
  display: grid;
  gap: 1.5rem;
}

.global-tasks-page__eyebrow,
.global-tasks-page__group-eyebrow,
.global-tasks-page__empty-eyebrow {
  margin: 0 0 0.45rem;
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.global-tasks-page__eyebrow {
  color: rgba(255, 255, 255, 0.72);
}

.global-tasks-page__title,
.global-tasks-page__group-title,
.global-tasks-page__empty-title {
  margin: 0;
  font-family: "Newsreader", serif;
}

.global-tasks-page__title {
  font-size: clamp(2rem, 4vw, 3rem);
}

.global-tasks-page__description {
  max-width: 42rem;
  margin: 0.75rem 0 0;
  color: rgba(255, 255, 255, 0.82);
  line-height: 1.6;
}

.global-tasks-page__summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.9rem;
}

.global-tasks-page__summary-card {
  padding: 1rem;
  border-radius: 1.15rem;
  background: rgba(255, 255, 255, 0.1);
}

.global-tasks-page__summary-label {
  margin: 0;
  color: rgba(255, 255, 255, 0.72);
  font-size: 0.9rem;
}

.global-tasks-page__summary-value {
  display: block;
  margin-top: 0.4rem;
  font-size: 2rem;
  line-height: 1;
}

.global-tasks-page__filters {
  display: grid;
  grid-template-columns: minmax(0, 12rem) minmax(0, 1fr) auto;
  gap: 1rem;
  align-items: center;
}

.global-tasks-page__loading,
.global-tasks-page__empty {
  display: grid;
  justify-items: center;
  gap: 0.75rem;
  padding: 2.5rem 1rem;
  text-align: center;
}

.global-tasks-page__empty-description {
  max-width: 32rem;
  margin: 0;
  color: #4f5f67;
}

.global-tasks-page__groups {
  display: grid;
  gap: 1rem;
}

.global-tasks-page__group {
  display: grid;
  gap: 1rem;
}

.global-tasks-page__group-header {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 1rem;
}

.global-tasks-page__group-eyebrow {
  color: #6c8f7d;
}

.global-tasks-page__group-title {
  color: #14323f;
  font-size: 1.65rem;
}

.global-tasks-page__task-list {
  display: grid;
  gap: 0.85rem;
}

.global-tasks-page__task-card {
  border: 1px solid rgba(20, 50, 63, 0.08);
  border-radius: 1.25rem;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.96), #f6f2ea);
}

.global-tasks-page__task-main {
  display: grid;
  gap: 1rem;
  padding: 1.15rem;
}

.global-tasks-page__task-head {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 1rem;
}

.global-tasks-page__task-title-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  align-items: center;
}

.global-tasks-page__task-title {
  margin: 0;
  color: #14323f;
  font-size: 1.1rem;
}

.global-tasks-page__task-type {
  margin: 0.35rem 0 0;
  color: #6c8f7d;
  font-weight: 700;
}

.global-tasks-page__task-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: end;
  gap: 0.45rem;
}

.global-tasks-page__task-description,
.global-tasks-page__task-blocked {
  margin: 0;
  color: #4f5f67;
  line-height: 1.6;
}

.global-tasks-page__task-blocked {
  color: #8a5d16;
  font-weight: 700;
}

.global-tasks-page__task-meta-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.75rem;
}

.global-tasks-page__task-meta {
  display: grid;
  gap: 0.2rem;
  margin: 0;
  color: #14323f;
  font-weight: 600;
}

.global-tasks-page__task-meta span {
  color: #6b7d85;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

@media (max-width: 960px) {
  .global-tasks-page__summary-grid,
  .global-tasks-page__task-meta-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .global-tasks-page__filters {
    grid-template-columns: 1fr;
  }

  .global-tasks-page__group-header,
  .global-tasks-page__task-head {
    align-items: start;
    flex-direction: column;
  }

  .global-tasks-page__task-actions {
    justify-content: start;
  }
}

@media (max-width: 640px) {
  .global-tasks-page__summary-grid,
  .global-tasks-page__task-meta-grid {
    grid-template-columns: 1fr;
  }
}
</style>
