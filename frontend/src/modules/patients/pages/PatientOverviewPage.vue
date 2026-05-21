<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";

import PatientFormDialog from "../components/PatientFormDialog.vue";
import { usePatientsStore } from "../store";
import type { PatientRecord, PatientUpsertPayload } from "../types";

const patientsStore = usePatientsStore();
const route = useRoute();
const router = useRouter();
const { d, t } = useI18n();

const isLoading = ref(false);
const isPatientSaving = ref(false);
const isPatientFormOpen = ref(false);

const patientId = computed(() => route.params.patientId as string);
const patient = computed(() => patientsStore.currentPatient);

const loadPage = async () => {
  isLoading.value = true;

  try {
    await patientsStore.loadPatient(patientId.value);
  } finally {
    isLoading.value = false;
  }
};

watch(patientId, loadPage);

onMounted(loadPage);

const formatDateOfBirth = (value: string | null) => {
  if (!value) {
    return t("patients.emptyDateOfBirth");
  }

  return d(new Date(`${value}T00:00:00`), "short");
};

const handleUpdate = async (payload: PatientUpsertPayload) => {
  isPatientSaving.value = true;

  try {
    await patientsStore.updatePatient(patientId.value, payload);
    isPatientFormOpen.value = false;
  } finally {
    isPatientSaving.value = false;
  }
};

const handleArchiveToggle = async () => {
  if (!patient.value) {
    return;
  }

  isPatientSaving.value = true;

  try {
    if (patient.value.archived) {
      await patientsStore.restorePatient(patient.value.id);
    } else {
      await patientsStore.archivePatient(patient.value.id);
    }
  } finally {
    isPatientSaving.value = false;
  }
};
</script>

<template>
  <q-page class="patient-overview-page">
    <q-card
      flat
      bordered
      class="patient-overview-page__hero"
    >
      <q-card-section
        v-if="isLoading"
        class="patient-overview-page__loading"
      >
        <q-spinner color="primary" size="2rem" />
      </q-card-section>

      <q-card-section v-else-if="patient">
        <div class="patient-overview-page__header">
          <div>
            <p class="patient-overview-page__eyebrow">
              {{ $t("patients.overviewEyebrow") }}
            </p>
            <div class="patient-overview-page__title-row">
              <h1 class="patient-overview-page__title">{{ patient.fullName }}</h1>
              <q-badge
                v-if="patient.archived"
                color="warning"
                text-color="dark"
                rounded
                :label="$t('patients.archivedBadge')"
              />
            </div>
          </div>

          <div class="patient-overview-page__actions">
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
              icon="folder_shared"
              :label="$t('documents.openPageAction')"
              @click="router.push(`/app/patients/${patientId}/documents`)"
            />
            <q-btn
              outline
              color="primary"
              no-caps
              icon="edit"
              :label="$t('patients.edit')"
              @click="isPatientFormOpen = true"
            />
            <q-btn
              :color="patient.archived ? 'positive' : 'warning'"
              unelevated
              no-caps
              :loading="isPatientSaving"
              :icon="patient.archived ? 'history' : 'archive'"
              :label="
                patient.archived ? $t('patients.restoreAction') : $t('patients.archiveAction')
              "
              @click="handleArchiveToggle"
            />
          </div>
        </div>

        <div class="patient-overview-page__meta">
          <q-card
            flat
            class="patient-overview-page__meta-card"
          >
            <p class="patient-overview-page__meta-label">
              {{ $t("patients.fields.dateOfBirth") }}
            </p>
            <p class="patient-overview-page__meta-value">
              {{ formatDateOfBirth(patient.dateOfBirth) }}
            </p>
          </q-card>
          <q-card
            flat
            class="patient-overview-page__meta-card"
          >
            <p class="patient-overview-page__meta-label">
              {{ $t("patients.fields.notes") }}
            </p>
            <p class="patient-overview-page__meta-value patient-overview-page__notes">
              {{ patient.notes || $t("patients.emptyNotes") }}
            </p>
          </q-card>
        </div>

        <q-card
          flat
          class="patient-overview-page__quick-links"
        >
          <q-card-section>
            <div class="patient-overview-page__quick-links-grid">
              <q-btn
                outline
                color="primary"
                no-caps
                icon="group"
                :label="$t('patients.access.manageAction')"
                @click="router.push(`/app/patients/${patientId}/access`)"
              />
              <q-btn
                outline
                color="primary"
                no-caps
                icon="medication"
                :label="$t('patients.prescriptions.viewAllAction')"
                @click="router.push(`/app/patients/${patientId}/prescriptions`)"
              />
              <q-btn
                outline
                color="primary"
                no-caps
                icon="event"
                :label="$t('patients.bookings.viewAllAction')"
                @click="router.push(`/app/patients/${patientId}/bookings`)"
              />
            </div>
          </q-card-section>
        </q-card>

      </q-card-section>
    </q-card>

    <PatientFormDialog
      v-model="isPatientFormOpen"
      :loading="isPatientSaving"
      :patient="patient as PatientRecord | null"
      :submit-label="$t('patients.save')"
      :title="$t('patients.editTitle')"
      @submit="handleUpdate"
    />
  </q-page>
</template>

<style scoped>
.patient-overview-page {
  display: grid;
  gap: 1rem;
}

.patient-overview-page__hero {
  border-radius: 1.5rem;
  background:
    linear-gradient(135deg, rgba(20, 50, 63, 0.04), transparent 40%),
    rgba(255, 255, 255, 0.94);
}

.patient-overview-page__loading {
  display: flex;
  justify-content: center;
  padding: 3rem;
}

.patient-overview-page__header {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 1rem;
}

.patient-overview-page__eyebrow,
.patient-overview-page__meta-label {
  margin: 0 0 0.4rem;
}

.patient-overview-page__eyebrow,
.patient-overview-page__meta-label {
  color: #6c8f7d;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.patient-overview-page__title-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.patient-overview-page__title {
  margin: 0;
  color: #14323f;
  font-family: "Newsreader", serif;
  font-size: clamp(2rem, 4vw, 3rem);
}

.patient-overview-page__actions,
.patient-overview-page__section-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.patient-overview-page__actions {
  justify-content: end;
}

.patient-overview-page__meta {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
  margin-top: 1.5rem;
}

.patient-overview-page__meta-card,
.patient-overview-page__quick-links {
  border-radius: 1.25rem;
  background: rgba(244, 246, 243, 0.9);
}

.patient-overview-page__meta-card {
  padding: 1rem 1.1rem;
}

.patient-overview-page__meta-value {
  margin: 0;
  color: #32505d;
  line-height: 1.6;
}

.patient-overview-page__notes {
  white-space: pre-wrap;
}

.patient-overview-page__quick-links {
  margin-top: 1rem;
}

.patient-overview-page__quick-links-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}
</style>
