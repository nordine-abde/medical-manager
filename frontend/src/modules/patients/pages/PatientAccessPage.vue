<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";

import { useAuthStore } from "../../auth/store";
import { usePatientsStore } from "../store";
import type { PatientUserRecord } from "../types";

const authStore = useAuthStore();
const patientsStore = usePatientsStore();
const route = useRoute();
const router = useRouter();
const { d, t } = useI18n();

const isLoading = ref(false);
const isPatientUsersSaving = ref(false);
const patientUserIdentifier = ref("");

const patientId = computed(() => route.params.patientId as string);
const patient = computed(() => patientsStore.currentPatient);
const patientUsers = computed(() => patientsStore.patientUsers);
const currentUserId = computed(() => authStore.user?.id ?? null);

const canSubmitPatientUser = computed(
  () => patientUserIdentifier.value.trim().length > 0 && !isPatientUsersSaving.value,
);

const loadPage = async () => {
  isLoading.value = true;

  try {
    await Promise.all([
      patientsStore.loadPatient(patientId.value),
      patientsStore.loadPatientUsers(patientId.value),
    ]);
  } finally {
    isLoading.value = false;
  }
};

watch(patientId, loadPage);

onMounted(loadPage);

const formatLinkedAt = (value: string) => d(new Date(value), "short");

const isCurrentUser = (user: PatientUserRecord) => user.id === currentUserId.value;

const handleAddPatientUser = async () => {
  const identifier = patientUserIdentifier.value.trim();

  if (!identifier) {
    return;
  }

  isPatientUsersSaving.value = true;

  try {
    await patientsStore.addPatientUser(patientId.value, identifier);
    patientUserIdentifier.value = "";
  } finally {
    isPatientUsersSaving.value = false;
  }
};

const handleRemovePatientUser = async (userId: string) => {
  isPatientUsersSaving.value = true;

  try {
    await patientsStore.removePatientUser(patientId.value, userId);
  } finally {
    isPatientUsersSaving.value = false;
  }
};
</script>

<template>
  <q-page class="patient-access-page">
    <q-card
      flat
      bordered
      class="patient-access-page__hero"
    >
      <q-card-section
        v-if="isLoading"
        class="patient-access-page__loading"
      >
        <q-spinner color="primary" size="2rem" />
      </q-card-section>

      <q-card-section v-else-if="patient">
        <div class="patient-access-page__header">
          <div>
            <p class="patient-access-page__eyebrow">
              {{ $t("patients.sharing.eyebrow") }}
            </p>
            <h1 class="patient-access-page__title">{{ patient.fullName }}</h1>
          </div>

          <div class="patient-access-page__actions">
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
          </div>
        </div>

        <p class="patient-access-page__description">
          {{ $t("patients.sharing.description") }}
        </p>

        <div class="patient-access-page__sharing-form">
          <q-input
            v-model="patientUserIdentifier"
            dense
            outlined
            class="patient-access-page__sharing-input"
            :label="$t('patients.sharing.identifierLabel')"
            :placeholder="$t('patients.sharing.identifierPlaceholder')"
            @keyup.enter="handleAddPatientUser"
          />
          <q-btn
            color="primary"
            unelevated
            no-caps
            icon="person_add"
            :disable="!canSubmitPatientUser"
            :loading="isPatientUsersSaving"
            :label="$t('patients.sharing.addAction')"
            @click="handleAddPatientUser"
          />
        </div>

        <div
          v-if="patientUsers.length > 0"
          class="patient-access-page__sharing-list"
        >
          <q-card
            v-for="user in patientUsers"
            :key="user.id"
            flat
            class="patient-access-page__sharing-card"
          >
            <div class="patient-access-page__sharing-head">
              <div class="patient-access-page__sharing-main">
                <div class="patient-access-page__sharing-title-row">
                  <h3 class="patient-access-page__sharing-title">
                    {{ user.fullName }}
                  </h3>
                  <q-badge
                    v-if="isCurrentUser(user)"
                    color="secondary"
                    rounded
                    :label="$t('patients.sharing.currentUserBadge')"
                  />
                </div>
                <p class="patient-access-page__sharing-copy">
                  {{ user.email }}
                </p>
                <p class="patient-access-page__sharing-meta">
                  <span>{{ $t("patients.sharing.linkedAt") }}</span>
                  {{ formatLinkedAt(user.linkedAt) }}
                </p>
              </div>

              <div class="patient-access-page__section-actions">
                <q-btn
                  color="negative"
                  flat
                  no-caps
                  icon="person_remove"
                  :disable="isCurrentUser(user)"
                  :loading="isPatientUsersSaving"
                  :label="$t('patients.sharing.removeAction')"
                  @click="handleRemovePatientUser(user.id)"
                />
              </div>
            </div>
          </q-card>
        </div>

        <q-card
          v-else
          flat
          class="patient-access-page__sharing-empty"
        >
          <p class="patient-access-page__summary-eyebrow">
            {{ $t("patients.sharing.emptyEyebrow") }}
          </p>
          <h3 class="patient-access-page__sharing-empty-title">
            {{ $t("patients.sharing.emptyTitle") }}
          </h3>
          <p class="patient-access-page__summary-copy">
            {{ $t("patients.sharing.emptyDescription") }}
          </p>
        </q-card>
      </q-card-section>
    </q-card>
  </q-page>
</template>

<style scoped>
.patient-access-page {
  display: grid;
  gap: 1rem;
}

.patient-access-page__hero {
  border-radius: 1.5rem;
  background:
    linear-gradient(135deg, rgba(20, 50, 63, 0.04), transparent 40%),
    rgba(255, 255, 255, 0.94);
}

.patient-access-page__loading {
  display: flex;
  justify-content: center;
  padding: 3rem;
}

.patient-access-page__header {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 1rem;
}

.patient-access-page__eyebrow {
  margin: 0 0 0.4rem;
  color: #6c8f7d;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.patient-access-page__title {
  margin: 0;
  color: #14323f;
  font-family: "Newsreader", serif;
  font-size: clamp(2rem, 4vw, 3rem);
}

.patient-access-page__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  justify-content: end;
}

.patient-access-page__description {
  margin: 1rem 0 1.5rem;
  color: #32505d;
  line-height: 1.6;
}

.patient-access-page__sharing-form {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
  margin-bottom: 1.5rem;
}

.patient-access-page__sharing-input {
  min-width: min(24rem, 100%);
}

.patient-access-page__sharing-list {
  display: grid;
  gap: 0.9rem;
}

.patient-access-page__sharing-card {
  padding: 1rem 1.1rem;
  border: 1px solid rgba(20, 50, 63, 0.06);
  border-radius: 1.25rem;
  background: rgba(244, 246, 243, 0.9);
}

.patient-access-page__sharing-head {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 1rem;
}

.patient-access-page__sharing-main {
  display: grid;
  gap: 0.45rem;
}

.patient-access-page__sharing-title-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
}

.patient-access-page__sharing-title {
  margin: 0;
  color: #14323f;
  font-weight: 700;
}

.patient-access-page__sharing-copy,
.patient-access-page__sharing-meta {
  margin: 0;
  color: #32505d;
  line-height: 1.6;
}

.patient-access-page__sharing-meta span {
  display: block;
  color: #6c8f7d;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.patient-access-page__section-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.patient-access-page__sharing-empty {
  padding: 1.5rem 1.1rem;
  text-align: center;
  border-radius: 1.25rem;
  background: rgba(244, 246, 243, 0.9);
}

.patient-access-page__summary-eyebrow {
  margin: 0 0 0.4rem;
  color: #6c8f7d;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.patient-access-page__sharing-empty-title {
  margin: 0.5rem 0;
  color: #14323f;
  font-family: "Newsreader", serif;
  font-size: 1.25rem;
}

.patient-access-page__summary-copy {
  margin: 0;
  color: #32505d;
  line-height: 1.6;
}

@media (max-width: 768px) {
  .patient-access-page__header {
    flex-direction: column;
  }

  .patient-access-page__actions {
    justify-content: start;
  }
}
</style>
