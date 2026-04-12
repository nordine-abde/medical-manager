<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";

import PatientFormDialog from "../components/PatientFormDialog.vue";
import { usePatientsStore } from "../store";
import type { PatientRecord, PatientUpsertPayload } from "../types";

const patientsStore = usePatientsStore();
const router = useRouter();
const { d, t } = useI18n();

const filters = reactive({
  includeArchived: false,
  search: "",
});
const errorMessage = ref("");
const isFormOpen = ref(false);
const isSaving = ref(false);
const editingPatient = ref<PatientRecord | null>(null);

const patients = computed(() => patientsStore.patients);
const isLoading = computed(() => patientsStore.status === "loading");

const loadPatients = async () => {
  errorMessage.value = "";

  try {
    await patientsStore.loadPatients(filters);
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : t("patients.genericError");
  }
};

let searchDebounce: ReturnType<typeof setTimeout> | null = null;

watch(
  () => filters.includeArchived,
  async () => {
    await loadPatients();
  },
);

watch(
  () => filters.search,
  (value) => {
    if (searchDebounce) {
      clearTimeout(searchDebounce);
    }

    searchDebounce = setTimeout(async () => {
      const nextSearch = (value ?? "").trim();

      if (nextSearch.length > 0 && nextSearch.length < 2) {
        return;
      }

      await loadPatients();
    }, 250);
  },
);

onMounted(async () => {
  await loadPatients();
});

const openCreateDialog = () => {
  editingPatient.value = null;
  isFormOpen.value = true;
};

const openEditDialog = (patient: PatientRecord) => {
  editingPatient.value = patient;
  isFormOpen.value = true;
};

const closeForm = () => {
  isFormOpen.value = false;
  editingPatient.value = null;
};

const formatDateOfBirth = (value: string | null) => {
  if (!value) {
    return t("patients.emptyDateOfBirth");
  }

  return d(new Date(`${value}T00:00:00`), "short");
};

const handleSubmit = async (payload: PatientUpsertPayload) => {
  isSaving.value = true;
  errorMessage.value = "";

  try {
    if (editingPatient.value) {
      await patientsStore.updatePatient(editingPatient.value.id, payload);
      closeForm();
      return;
    }

    const patient = await patientsStore.createPatient(payload);
    closeForm();
    await router.push(`/app/patients/${patient.id}/overview`);
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : t("patients.genericError");
  } finally {
    isSaving.value = false;
  }
};

const handleArchiveToggle = async (patient: PatientRecord) => {
  errorMessage.value = "";

  try {
    if (patient.archived) {
      await patientsStore.restorePatient(patient.id);
      return;
    }

    await patientsStore.archivePatient(patient.id);
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : t("patients.genericError");
  }
};

const getInitials = (name: string) => {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
};
</script>

<template>
  <q-page class="patient-list-page">
    <div class="patient-list-page__header">
      <div class="patient-list-page__header-content">
        <div>
          <h1 class="patient-list-page__title">{{ $t("patients.title") }}</h1>
          <p class="patient-list-page__description">
            {{ $t("patients.description") }}
          </p>
        </div>
        <q-btn
          color="primary"
          unelevated
          no-caps
          icon="add"
          class="patient-list-page__create-btn"
          :label="$t('patients.create')"
          @click="openCreateDialog"
        />
      </div>
    </div>

    <q-card flat class="patient-list-page__card">
      <q-card-section class="patient-list-page__toolbar">
        <q-input
          v-model="filters.search"
          outlined
          dense
          clearable
          debounce="0"
          class="patient-list-page__search"
          :placeholder="$t('patients.searchPlaceholder')"
        >
          <template #prepend>
            <q-icon name="search" color="grey-6" />
          </template>
        </q-input>

        <q-toggle
          v-model="filters.includeArchived"
          dense
          color="primary"
          :label="$t('patients.showArchived')"
        />
      </q-card-section>

      <q-separator />

      <q-card-section
        v-if="isLoading"
        class="patient-list-page__loading"
      >
        <q-spinner color="primary" size="2.5rem" />
      </q-card-section>

      <q-card-section
        v-else-if="patients.length === 0"
        class="patient-list-page__empty"
      >
        <div class="patient-list-page__empty-content">
          <q-icon name="group_off" size="4rem" color="grey-4" />
          <h2 class="patient-list-page__empty-title">
            {{ filters.includeArchived ? $t("patients.emptyArchivedTitle") : $t("patients.emptyTitle") }}
          </h2>
          <p class="patient-list-page__empty-text">
            {{ filters.includeArchived ? $t("patients.emptyArchivedDescription") : $t("patients.emptyDescription") }}
          </p>
          <q-btn
            v-if="!filters.includeArchived"
            color="primary"
            unelevated
            no-caps
            icon="add"
            :label="$t('patients.create')"
            @click="openCreateDialog"
          />
        </div>
      </q-card-section>

      <div
        v-else
        class="patient-list-page__grid"
      >
        <q-card
          v-for="patient in patients"
          :key="patient.id"
          flat
          class="patient-list-page__item"
          :class="{ 'patient-list-page__item--archived': patient.archived }"
        >
          <div class="patient-list-page__item-main">
            <div class="patient-list-page__item-avatar">
              {{ getInitials(patient.fullName) }}
            </div>
            <div class="patient-list-page__item-info">
              <div class="patient-list-page__item-header">
                <h2 class="patient-list-page__item-name">{{ patient.fullName }}</h2>
                <q-badge
                  v-if="patient.archived"
                  color="grey-6"
                  text-color="white"
                  class="patient-list-page__item-badge"
                >
                  {{ $t('patients.archivedBadge') }}
                </q-badge>
              </div>
              <div class="patient-list-page__item-meta">
                <q-icon name="cake" size="0.875rem" color="grey-6" />
                <span>{{ formatDateOfBirth(patient.dateOfBirth) }}</span>
              </div>
              <p
                v-if="patient.notes"
                class="patient-list-page__item-notes"
              >
                {{ patient.notes }}
              </p>
            </div>
          </div>

          <div class="patient-list-page__item-actions">
            <q-btn
              flat
              round
              dense
              color="primary"
              icon="open_in_new"
              :to="`/app/patients/${patient.id}/overview`"
            >
              <q-tooltip>{{ $t('patients.open') }}</q-tooltip>
            </q-btn>
            <q-btn
              flat
              round
              dense
              color="grey-7"
              icon="edit"
              @click="openEditDialog(patient)"
            >
              <q-tooltip>{{ $t('patients.edit') }}</q-tooltip>
            </q-btn>
            <q-btn
              flat
              round
              dense
              :color="patient.archived ? 'positive' : 'grey-7'"
              :icon="patient.archived ? 'unarchive' : 'archive'"
              @click="handleArchiveToggle(patient)"
            >
              <q-tooltip>
                {{ patient.archived ? $t('patients.restoreAction') : $t('patients.archiveAction') }}
              </q-tooltip>
            </q-btn>
          </div>
        </q-card>
      </div>
    </q-card>

    <q-banner
      v-if="errorMessage"
      rounded
      class="patient-list-page__banner"
    >
      <template #avatar>
        <q-icon name="error" color="negative" />
      </template>
      {{ errorMessage }}
      <template #action>
        <q-btn
          flat
          color="negative"
          :label="$t('common.dismiss')"
          @click="errorMessage = ''"
        />
      </template>
    </q-banner>

    <PatientFormDialog
      v-model="isFormOpen"
      :loading="isSaving"
      :patient="editingPatient"
      :submit-label="editingPatient ? $t('patients.save') : $t('patients.createAction')"
      :title="editingPatient ? $t('patients.editTitle') : $t('patients.createTitle')"
      @submit="handleSubmit"
      @update:model-value="(value) => { if (!value) closeForm(); }"
    />
  </q-page>
</template>

<style scoped>
.patient-list-page {
  max-width: 1400px;
  margin: 0 auto;
}

.patient-list-page__header {
  margin-bottom: 1.5rem;
}

.patient-list-page__header-content {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.patient-list-page__title {
  margin: 0 0 0.375rem;
  color: #14323f;
  font-size: 1.75rem;
  font-weight: 600;
}

.patient-list-page__description {
  margin: 0;
  color: #6c757d;
  font-size: 1rem;
}

.patient-list-page__create-btn {
  border-radius: 0.625rem;
  padding: 0.5rem 1.25rem;
}

.patient-list-page__card {
  background: #ffffff;
  border-radius: 1rem;
  box-shadow: 0 1px 3px rgba(20, 50, 63, 0.08);
}

.patient-list-page__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  padding: 1rem 1.25rem;
}

.patient-list-page__search {
  min-width: 280px;
  max-width: 400px;
}

.patient-list-page__search :deep(.q-field__control) {
  border-radius: 0.625rem;
}

.patient-list-page__loading {
  display: flex;
  justify-content: center;
  padding: 4rem;
}

.patient-list-page__empty {
  padding: 4rem 2rem;
}

.patient-list-page__empty-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 1rem;
}

.patient-list-page__empty-title {
  margin: 0.5rem 0 0;
  color: #14323f;
  font-size: 1.25rem;
  font-weight: 600;
}

.patient-list-page__empty-text {
  margin: 0;
  color: #6c757d;
  font-size: 0.9375rem;
  max-width: 400px;
}

.patient-list-page__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 1rem;
  padding: 1.25rem;
}

.patient-list-page__item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem;
  background: #ffffff;
  border: 1px solid rgba(20, 50, 63, 0.08);
  border-radius: 0.75rem;
  transition: all 0.2s ease;
}

.patient-list-page__item:hover {
  border-color: rgba(40, 83, 107, 0.2);
  box-shadow: 0 2px 8px rgba(20, 50, 63, 0.08);
  transform: translateY(-1px);
}

.patient-list-page__item--archived {
  background: #f8f9fa;
  opacity: 0.85;
}

.patient-list-page__item-main {
  display: flex;
  align-items: flex-start;
  gap: 0.875rem;
  min-width: 0;
}

.patient-list-page__item-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 2.75rem;
  height: 2.75rem;
  background: linear-gradient(135deg, #28536b, #6c8f7d);
  border-radius: 0.75rem;
  color: #ffffff;
  font-size: 0.9375rem;
  font-weight: 600;
}

.patient-list-page__item--archived .patient-list-page__item-avatar {
  background: linear-gradient(135deg, #6c757d, #adb5bd);
}

.patient-list-page__item-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
}

.patient-list-page__item-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.patient-list-page__item-name {
  margin: 0;
  color: #14323f;
  font-size: 1rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.patient-list-page__item-badge {
  font-size: 0.6875rem;
  font-weight: 600;
}

.patient-list-page__item-meta {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  color: #6c757d;
  font-size: 0.875rem;
}

.patient-list-page__item-notes {
  margin: 0.25rem 0 0;
  color: #6c757d;
  font-size: 0.8125rem;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.patient-list-page__item-actions {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.patient-list-page__item:hover .patient-list-page__item-actions {
  opacity: 1;
}

.patient-list-page__banner {
  position: fixed;
  bottom: 1.5rem;
  right: 1.5rem;
  left: calc(240px + 2rem);
  max-width: 600px;
  background: #ffffff;
  border: 1px solid rgba(183, 80, 63, 0.2);
  border-radius: 0.75rem;
  box-shadow: 0 4px 12px rgba(20, 50, 63, 0.15);
}

@media (max-width: 768px) {
  .patient-list-page__header-content {
    flex-direction: column;
  }

  .patient-list-page__search {
    min-width: 100%;
  }

  .patient-list-page__grid {
    grid-template-columns: 1fr;
  }

  .patient-list-page__item-actions {
    opacity: 1;
  }

  .patient-list-page__banner {
    left: 1rem;
    right: 1rem;
  }
}
</style>
