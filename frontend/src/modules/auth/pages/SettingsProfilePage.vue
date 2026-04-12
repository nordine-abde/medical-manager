<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

import { useAuthStore } from "../store";
import type {
  PreferredLanguage,
  SessionUser,
  UpdateCurrentUserPayload,
} from "../types";

const authStore = useAuthStore();
const { t } = useI18n();

const isSaving = ref(false);
const errorMessage = ref("");
const successMessage = ref("");

const form = reactive({
  fullName: "",
  preferredLanguage: "en" as PreferredLanguage,
});

const languageOptions = computed(() => [
  {
    label: t("settings.languageOptions.en"),
    value: "en",
  },
  {
    label: t("settings.languageOptions.it"),
    value: "it",
  },
]);

const syncForm = (user: SessionUser | null) => {
  form.fullName = user?.fullName ?? "";
  form.preferredLanguage = user?.preferredLanguage ?? "en";
};

const isDirty = computed(
  () =>
    form.fullName.trim() !== (authStore.user?.fullName ?? "") ||
    form.preferredLanguage !== (authStore.user?.preferredLanguage ?? "en"),
);

watch(
  () => authStore.user,
  (user) => {
    syncForm(user);
  },
  {
    immediate: true,
  },
);

const handleSubmit = async () => {
  if (!authStore.user) {
    return;
  }

  const payload: UpdateCurrentUserPayload = {
    fullName: form.fullName.trim(),
    preferredLanguage: form.preferredLanguage,
  };

  isSaving.value = true;
  errorMessage.value = "";
  successMessage.value = "";

  try {
    await authStore.updateCurrentUser(payload);
    successMessage.value = t("settings.saveSuccess");
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : t("settings.genericError");
  } finally {
    isSaving.value = false;
  }
};
</script>

<template>
  <q-page class="settings-profile-page">
    <section class="settings-profile-page__hero">
      <div>
        <p class="settings-profile-page__eyebrow">
          {{ $t("settings.eyebrow") }}
        </p>
        <h2 class="settings-profile-page__title">{{ $t("settings.title") }}</h2>
      </div>
      <p class="settings-profile-page__description">
        {{ $t("settings.description") }}
      </p>
    </section>

    <div class="settings-profile-page__grid">
      <q-card
        flat
        bordered
        class="settings-profile-page__card"
      >
        <q-card-section class="settings-profile-page__card-header">
          <div>
            <p class="settings-profile-page__section-eyebrow">
              {{ $t("settings.profileEyebrow") }}
            </p>
            <h3 class="settings-profile-page__section-title">
              {{ $t("settings.profileTitle") }}
            </h3>
          </div>
          <q-chip
            square
            color="primary"
            text-color="white"
            class="settings-profile-page__status-chip"
          >
            {{ $t("settings.statusReady") }}
          </q-chip>
        </q-card-section>

        <q-card-section>
          <q-form
            class="settings-profile-page__form"
            @submit.prevent="handleSubmit"
          >
            <q-input
              :model-value="authStore.user?.email ?? ''"
              outlined
              readonly
              autocomplete="email"
              :label="$t('settings.fields.email')"
            />

            <q-input
              v-model="form.fullName"
              outlined
              autocomplete="name"
              :disable="isSaving"
              :label="$t('auth.fullName')"
              :rules="[
                (value) =>
                  Boolean(String(value).trim()) || t('auth.validation.fullNameRequired'),
              ]"
            />

            <q-select
              v-model="form.preferredLanguage"
              outlined
              emit-value
              map-options
              :disable="isSaving"
              :label="$t('settings.fields.preferredLanguage')"
              :options="languageOptions"
            />

            <q-banner
              v-if="errorMessage"
              rounded
              inline-actions
              class="settings-profile-page__banner settings-profile-page__banner--error"
            >
              {{ errorMessage }}
            </q-banner>

            <q-banner
              v-else-if="successMessage"
              rounded
              inline-actions
              class="settings-profile-page__banner settings-profile-page__banner--success"
            >
              {{ successMessage }}
            </q-banner>

            <div class="settings-profile-page__actions">
              <q-btn
                flat
                no-caps
                :disable="isSaving || !isDirty"
                :label="$t('settings.reset')"
                @click="syncForm(authStore.user)"
              />
              <q-btn
                color="primary"
                type="submit"
                unelevated
                no-caps
                :disable="!isDirty"
                :loading="isSaving"
                :label="$t('settings.save')"
              />
            </div>
          </q-form>
        </q-card-section>
      </q-card>

      <q-card
        flat
        bordered
        class="settings-profile-page__card settings-profile-page__card--aside"
      >
        <q-card-section class="settings-profile-page__aside">
          <p class="settings-profile-page__section-eyebrow">
            {{ $t("settings.accountEyebrow") }}
          </p>
          <h3 class="settings-profile-page__section-title">
            {{ $t("settings.accountTitle") }}
          </h3>
          <p class="settings-profile-page__aside-copy">
            {{ $t("settings.accountDescription") }}
          </p>

          <dl class="settings-profile-page__summary-list">
            <div class="settings-profile-page__summary-row">
              <dt>{{ $t("settings.fields.email") }}</dt>
              <dd>{{ authStore.user?.email ?? $t("settings.summary.emailFallback") }}</dd>
            </div>
            <div class="settings-profile-page__summary-row">
              <dt>{{ $t("auth.fullName") }}</dt>
              <dd>{{ authStore.user?.fullName ?? "—" }}</dd>
            </div>
            <div class="settings-profile-page__summary-row">
              <dt>{{ $t("settings.summary.profileStatus") }}</dt>
              <dd>{{ $t("settings.statusReady") }}</dd>
            </div>
            <div class="settings-profile-page__summary-row">
              <dt>{{ $t("settings.fields.preferredLanguage") }}</dt>
              <dd>
                {{
                  authStore.user?.preferredLanguage === "it"
                    ? $t("settings.languageOptions.it")
                    : $t("settings.languageOptions.en")
                }}
              </dd>
            </div>
          </dl>
        </q-card-section>
      </q-card>
    </div>
  </q-page>
</template>

<style scoped>
.settings-profile-page {
  display: grid;
  gap: 1.25rem;
}

.settings-profile-page__hero {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.5rem;
  border-radius: 1.5rem;
  background:
    linear-gradient(135deg, rgba(20, 50, 63, 0.94), rgba(40, 83, 107, 0.88)),
    #14323f;
  color: #f6f4ef;
}

.settings-profile-page__eyebrow,
.settings-profile-page__section-eyebrow {
  margin: 0 0 0.35rem;
  color: #cfb18c;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.settings-profile-page__title,
.settings-profile-page__section-title {
  margin: 0;
  font-family: "Newsreader", serif;
}

.settings-profile-page__title {
  font-size: clamp(2rem, 3vw, 2.7rem);
}

.settings-profile-page__description {
  max-width: 30rem;
  margin: 0;
  color: rgba(246, 244, 239, 0.82);
  line-height: 1.6;
}

.settings-profile-page__grid {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(18rem, 0.85fr);
  gap: 1rem;
}

.settings-profile-page__card {
  border-radius: 1.5rem;
  background: rgba(255, 255, 255, 0.88);
}

.settings-profile-page__card-header {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 1rem;
}

.settings-profile-page__status-chip {
  font-weight: 700;
  letter-spacing: 0.04em;
}

.settings-profile-page__form {
  display: grid;
  gap: 1rem;
}

.settings-profile-page__banner--error {
  background: rgba(179, 56, 45, 0.08);
  color: #7e2017;
}

.settings-profile-page__banner--success {
  background: rgba(57, 122, 89, 0.1);
  color: #1e5a39;
}

.settings-profile-page__actions {
  display: flex;
  justify-content: end;
  gap: 0.75rem;
  margin-top: 0.5rem;
}

.settings-profile-page__aside {
  display: grid;
  gap: 1rem;
}

.settings-profile-page__aside-copy {
  margin: 0;
  color: #4b646f;
  line-height: 1.6;
}

.settings-profile-page__summary-list {
  display: grid;
  gap: 0.85rem;
  margin: 0;
}

.settings-profile-page__summary-row {
  display: grid;
  gap: 0.25rem;
  padding-bottom: 0.85rem;
  border-bottom: 1px solid rgba(20, 50, 63, 0.1);
}

.settings-profile-page__summary-row:last-child {
  padding-bottom: 0;
  border-bottom: 0;
}

.settings-profile-page__summary-row dt {
  color: #6c8f7d;
  font-size: 0.85rem;
  font-weight: 700;
  text-transform: uppercase;
}

.settings-profile-page__summary-row dd {
  margin: 0;
  color: #14323f;
  font-weight: 700;
}

@media (max-width: 960px) {
  .settings-profile-page__hero,
  .settings-profile-page__grid {
    grid-template-columns: 1fr;
  }

  .settings-profile-page__hero {
    align-items: start;
  }
}
</style>
