<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { useI18n } from "vue-i18n";

import { usePatientsStore } from "../../patients/store";
import { useNotificationsStore } from "../store";
import type { NotificationSettingsRecord } from "../types";

const route = useRoute();
const { t } = useI18n();

const notificationsStore = useNotificationsStore();
const patientsStore = usePatientsStore();

const patientId = computed(() =>
  typeof route.params.patientId === "string" ? route.params.patientId : "",
);
const patientName = computed(
  () => patientsStore.currentPatient?.fullName ?? t("notifications.patientFallback"),
);
const isLoading = computed(() => notificationsStore.status === "loading");
const isSaving = ref(false);
const isSendingTestReminder = ref(false);
const canSendTestReminder = computed(
  () =>
    !isSaving.value &&
    !isLoading.value &&
    !isSendingTestReminder.value &&
    Boolean(notificationsStore.currentSettings?.telegramChatId.trim()),
);
const errorMessage = ref("");
const successMessage = ref("");

const form = reactive({
  medicationRenewalDaysBeforeDue: 1,
  medicationRenewalEnabled: false,
  taskOverdueEnabled: false,
  telegramChatId: "",
  upcomingBookingDaysBeforeDue: 2,
  upcomingBookingEnabled: false,
});

function syncForm(settings: NotificationSettingsRecord | null) {
  form.telegramChatId = settings?.telegramChatId ?? "";
  form.taskOverdueEnabled = settings?.taskOverdue.enabled ?? false;
  form.upcomingBookingEnabled = settings?.upcomingBooking.enabled ?? false;
  form.upcomingBookingDaysBeforeDue = settings?.upcomingBooking.daysBeforeDue ?? 2;
  form.medicationRenewalEnabled = settings?.medicationRenewal.enabled ?? false;
  form.medicationRenewalDaysBeforeDue =
    settings?.medicationRenewal.daysBeforeDue ?? 1;
}

const isDirty = computed(() => {
  const currentSettings = notificationsStore.currentSettings;

  if (!currentSettings) {
    return false;
  }

  return (
    form.telegramChatId.trim() !== currentSettings.telegramChatId ||
    form.taskOverdueEnabled !== currentSettings.taskOverdue.enabled ||
    form.upcomingBookingEnabled !== currentSettings.upcomingBooking.enabled ||
    form.upcomingBookingDaysBeforeDue !== currentSettings.upcomingBooking.daysBeforeDue ||
    form.medicationRenewalEnabled !== currentSettings.medicationRenewal.enabled ||
    form.medicationRenewalDaysBeforeDue !==
      currentSettings.medicationRenewal.daysBeforeDue
  );
});

watch(
  () => notificationsStore.currentSettings,
  (settings) => {
    syncForm(settings);
  },
  { immediate: true },
);

const loadPage = async () => {
  if (!patientId.value) {
    return;
  }

  errorMessage.value = "";

  try {
    await Promise.all([
      patientsStore.loadPatient(patientId.value),
      notificationsStore.loadPatientSettings(patientId.value),
    ]);
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : t("notifications.genericError");
  }
};

watch(
  () => patientId.value,
  async () => {
    await loadPage();
  },
  { immediate: true },
);

const handleSubmit = async () => {
  if (!patientId.value) {
    return;
  }

  errorMessage.value = "";
  successMessage.value = "";

  isSaving.value = true;

  try {
    await notificationsStore.updatePatientSettings(patientId.value, {
      medicationRenewal: {
        daysBeforeDue: form.medicationRenewalDaysBeforeDue,
        enabled: form.medicationRenewalEnabled,
      },
      taskOverdue: {
        enabled: form.taskOverdueEnabled,
      },
      telegramChatId: form.telegramChatId.trim(),
      upcomingBooking: {
        daysBeforeDue: form.upcomingBookingDaysBeforeDue,
        enabled: form.upcomingBookingEnabled,
      },
    });
    successMessage.value = t("notifications.saveSuccess");
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : t("notifications.genericError");
  } finally {
    isSaving.value = false;
  }
};

const handleSendTestReminder = async () => {
  errorMessage.value = "";
  successMessage.value = "";

  if (!canSendTestReminder.value) {
    return;
  }

  isSendingTestReminder.value = true;

  try {
    const processedLogs = await notificationsStore.processPendingNotifications();
    const matchedLog = [...processedLogs].reverse().find((log) => {
      if (log.patientId !== patientId.value) {
        return false;
      }

      if (!notificationsStore.currentSettings) {
        return false;
      }

      return log.destination === notificationsStore.currentSettings.telegramChatId;
    });

    successMessage.value = matchedLog
      ? t("notifications.deliverySuccess")
      : t("notifications.deliveryEmpty");
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : t("notifications.genericError");
  } finally {
    isSendingTestReminder.value = false;
  }
};
</script>

<template>
  <q-page class="notification-settings-page">
    <q-banner v-if="errorMessage" rounded class="notification-settings-page__banner">
      {{ errorMessage }}
    </q-banner>

    <q-card flat bordered class="notification-settings-page__hero">
      <q-card-section class="notification-settings-page__hero-content">
        <div>
          <p class="notification-settings-page__eyebrow">
            {{ $t("notifications.eyebrow") }}
          </p>
          <h1 class="notification-settings-page__title">
            {{ $t("notifications.title") }}
          </h1>
          <p class="notification-settings-page__subtitle">
            {{ $t("notifications.subtitle", { patientName }) }}
          </p>
        </div>
        <p class="notification-settings-page__description">
          {{ $t("notifications.description") }}
        </p>
      </q-card-section>
    </q-card>

    <q-card flat bordered class="notification-settings-page__panel">
      <q-card-section v-if="isLoading" class="notification-settings-page__loading">
        <q-spinner color="primary" size="2.2rem" />
      </q-card-section>

      <q-card-section v-else class="notification-settings-page__panel-content">
        <q-form class="notification-settings-page__form" @submit.prevent="handleSubmit">
          <q-input
            v-model="form.telegramChatId"
            outlined
            :disable="isSaving"
            :label="$t('notifications.fields.telegramChatId')"
            :hint="$t('notifications.fields.telegramChatIdHint')"
            :rules="[(value) => Boolean(String(value).trim()) || t('notifications.validation.telegramChatIdRequired')]"
          />

          <div class="notification-settings-page__rule-grid">
            <q-card flat bordered class="notification-settings-page__rule-card">
              <q-card-section>
                <div class="notification-settings-page__rule-header">
                  <div>
                    <p class="notification-settings-page__rule-eyebrow">
                      {{ $t("notifications.rules.taskOverdue.eyebrow") }}
                    </p>
                    <h2 class="notification-settings-page__rule-title">
                      {{ $t("notifications.rules.taskOverdue.title") }}
                    </h2>
                  </div>
                  <q-toggle
                    v-model="form.taskOverdueEnabled"
                    color="primary"
                    :disable="isSaving"
                    :label="$t('notifications.actions.enabled')"
                  />
                </div>
                <p class="notification-settings-page__rule-description">
                  {{ $t("notifications.rules.taskOverdue.description") }}
                </p>
              </q-card-section>
            </q-card>

            <q-card flat bordered class="notification-settings-page__rule-card">
              <q-card-section>
                <div class="notification-settings-page__rule-header">
                  <div>
                    <p class="notification-settings-page__rule-eyebrow">
                      {{ $t("notifications.rules.upcomingBooking.eyebrow") }}
                    </p>
                    <h2 class="notification-settings-page__rule-title">
                      {{ $t("notifications.rules.upcomingBooking.title") }}
                    </h2>
                  </div>
                  <q-toggle
                    v-model="form.upcomingBookingEnabled"
                    color="primary"
                    :disable="isSaving"
                    :label="$t('notifications.actions.enabled')"
                  />
                </div>
                <p class="notification-settings-page__rule-description">
                  {{ $t("notifications.rules.upcomingBooking.description") }}
                </p>
                <q-input
                  v-model.number="form.upcomingBookingDaysBeforeDue"
                  outlined
                  type="number"
                  min="0"
                  :disable="isSaving || !form.upcomingBookingEnabled"
                  :label="$t('notifications.fields.daysBeforeDue')"
                  :hint="
                    form.upcomingBookingEnabled
                      ? undefined
                      : $t('notifications.helper.leadTimeDisabled')
                  "
                />
              </q-card-section>
            </q-card>

            <q-card flat bordered class="notification-settings-page__rule-card">
              <q-card-section>
                <div class="notification-settings-page__rule-header">
                  <div>
                    <p class="notification-settings-page__rule-eyebrow">
                      {{ $t("notifications.rules.medicationRenewal.eyebrow") }}
                    </p>
                    <h2 class="notification-settings-page__rule-title">
                      {{ $t("notifications.rules.medicationRenewal.title") }}
                    </h2>
                  </div>
                  <q-toggle
                    v-model="form.medicationRenewalEnabled"
                    color="primary"
                    :disable="isSaving"
                    :label="$t('notifications.actions.enabled')"
                  />
                </div>
                <p class="notification-settings-page__rule-description">
                  {{ $t("notifications.rules.medicationRenewal.description") }}
                </p>
                <q-input
                  v-model.number="form.medicationRenewalDaysBeforeDue"
                  outlined
                  type="number"
                  min="0"
                  :disable="isSaving || !form.medicationRenewalEnabled"
                  :label="$t('notifications.fields.daysBeforeDue')"
                  :hint="
                    form.medicationRenewalEnabled
                      ? undefined
                      : $t('notifications.helper.leadTimeDisabled')
                  "
                />
              </q-card-section>
            </q-card>
          </div>

          <q-banner
            v-if="successMessage"
            rounded
            class="notification-settings-page__banner notification-settings-page__banner--success"
          >
            {{ successMessage }}
          </q-banner>

          <div class="notification-settings-page__actions">
            <q-btn
              color="secondary"
              outline
              no-caps
              icon="send"
              :disable="!canSendTestReminder"
              :loading="isSendingTestReminder"
              :label="$t('notifications.actions.sendTestReminder')"
              @click="handleSendTestReminder"
            />
            <q-btn
              flat
              no-caps
              :disable="
                isSaving ||
                isSendingTestReminder ||
                !notificationsStore.currentSettings
              "
              :label="$t('notifications.reset')"
              @click="syncForm(notificationsStore.currentSettings)"
            />
            <q-btn
              color="primary"
              type="submit"
              unelevated
              no-caps
              :disable="!isDirty || isSendingTestReminder"
              :loading="isSaving"
              :label="$t('notifications.save')"
            />
          </div>
        </q-form>
      </q-card-section>
    </q-card>
  </q-page>
</template>

<style scoped>
.notification-settings-page {
  display: grid;
  gap: 1.25rem;
}

.notification-settings-page__hero {
  border-radius: 1.5rem;
  background:
    radial-gradient(circle at top right, rgba(214, 146, 89, 0.18), transparent 38%),
    linear-gradient(135deg, rgba(20, 50, 63, 0.96), rgba(54, 84, 95, 0.9));
  color: #f8f4ee;
}

.notification-settings-page__hero-content {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
}

.notification-settings-page__eyebrow,
.notification-settings-page__rule-eyebrow {
  margin: 0 0 0.35rem;
  color: #dcb88b;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.notification-settings-page__title,
.notification-settings-page__rule-title {
  margin: 0;
}

.notification-settings-page__subtitle,
.notification-settings-page__description,
.notification-settings-page__rule-description {
  margin: 0;
  color: rgba(248, 244, 238, 0.8);
}

.notification-settings-page__panel,
.notification-settings-page__rule-card {
  border-radius: 1.5rem;
}

.notification-settings-page__panel-content,
.notification-settings-page__form {
  display: grid;
  gap: 1rem;
}

.notification-settings-page__rule-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1rem;
}

.notification-settings-page__rule-header {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 1rem;
}

.notification-settings-page__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}

.notification-settings-page__loading {
  display: flex;
  justify-content: center;
  padding: 2.5rem;
}

.notification-settings-page__banner--success {
  background: rgba(66, 143, 86, 0.14);
  color: #1d6e36;
}

@media (max-width: 960px) {
  .notification-settings-page__hero-content {
    flex-direction: column;
  }

  .notification-settings-page__rule-grid {
    grid-template-columns: 1fr;
  }

  .notification-settings-page__rule-header,
  .notification-settings-page__actions {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
