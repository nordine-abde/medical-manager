<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";

import { useAuthStore } from "../modules/auth/store";
import type { PreferredLanguage } from "../modules/auth/types";

const authStore = useAuthStore();
const router = useRouter();
const { locale, t } = useI18n();

defineProps<{
  menuOpen?: boolean;
}>();

const emit = defineEmits<{
  toggleMenu: [];
}>();

const userMenuOpen = ref(false);

const languageOptions = computed(() => [
  { label: "English", value: "en" },
  { label: "Italiano", value: "it" },
]);

const selectedLanguage = computed<PreferredLanguage>({
  get: () => authStore.user?.preferredLanguage ?? "en",
  set: (value) => {
    locale.value = value;
    void authStore.updatePreferredLanguage(value);
  },
});

watch(
  () => authStore.user?.preferredLanguage,
  (preferredLanguage) => {
    if (preferredLanguage) {
      locale.value = preferredLanguage;
    }
  },
  { immediate: true },
);

const handleSignOut = async () => {
  await authStore.signOut();
  await router.replace("/auth/sign-in");
};

const userInitials = computed(() => {
  const name = authStore.user?.fullName ?? "";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
});
</script>

<template>
  <q-header class="app-top-nav">
    <div class="app-top-nav__content">
      <div class="app-top-nav__section">
        <q-btn
          flat
          dense
          round
          icon="menu"
          class="app-top-nav__menu-btn lt-md"
          aria-label="Toggle menu"
          :aria-expanded="menuOpen"
          @click="emit('toggleMenu')"
        />
        <h1 class="app-top-nav__title">{{ t("shell.welcome") }}</h1>
      </div>

      <div class="app-top-nav__section">
        <q-select
          v-model="selectedLanguage"
          dense
          borderless
          emit-value
          map-options
          options-dense
          :options="languageOptions"
          class="app-top-nav__language"
          dropdown-icon="language"
        />

        <q-btn-dropdown
          v-if="authStore.user"
          v-model="userMenuOpen"
          flat
          no-caps
          class="app-top-nav__user-btn"
        >
          <template #label>
            <div class="app-top-nav__user-label">
              <div class="app-top-nav__avatar">
                {{ userInitials }}
              </div>
              <span class="app-top-nav__user-name gt-sm">{{ authStore.user.fullName }}</span>
            </div>
          </template>

          <q-list class="app-top-nav__menu">
            <q-item class="app-top-nav__menu-header">
              <q-item-section>
                <q-item-label class="app-top-nav__menu-name">
                  {{ authStore.user.fullName }}
                </q-item-label>
                <q-item-label caption>{{ authStore.user.email }}</q-item-label>
              </q-item-section>
            </q-item>

            <q-separator />

            <q-item
              v-close-popup
              clickable
              to="/app/settings"
            >
              <q-item-section avatar>
                <q-icon name="settings" size="1.25rem" />
              </q-item-section>
              <q-item-section>{{ t("nav.settings") }}</q-item-section>
            </q-item>

            <q-separator />

            <q-item
              v-close-popup
              clickable
              class="app-top-nav__sign-out"
              @click="handleSignOut"
            >
              <q-item-section avatar>
                <q-icon name="logout" size="1.25rem" color="negative" />
              </q-item-section>
              <q-item-section class="text-negative">{{ t("nav.signOut") }}</q-item-section>
            </q-item>
          </q-list>
        </q-btn-dropdown>
      </div>
    </div>
  </q-header>
</template>

<style scoped>
.app-top-nav {
  background: #ffffff;
  border-bottom: 1px solid rgba(20, 50, 63, 0.08);
  box-shadow: 0 1px 2px rgba(20, 50, 63, 0.04);
}

.app-top-nav__content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 64px;
  padding: 0 1.5rem;
}

.app-top-nav__section {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.app-top-nav__menu-btn {
  margin-right: 0.5rem;
  color: #4b646f;
}

.app-top-nav__title {
  margin: 0;
  color: #14323f;
  font-size: 1.25rem;
  font-weight: 600;
}

.app-top-nav__language {
  min-width: 7rem;
}

.app-top-nav__language :deep(.q-field__control) {
  padding: 0 0.5rem;
}

.app-top-nav__language :deep(.q-field__native) {
  color: #4b646f;
  font-weight: 500;
}

.app-top-nav__user-btn {
  padding: 0.25rem 0.5rem;
  border-radius: 0.625rem;
}

.app-top-nav__user-btn:hover {
  background: rgba(40, 83, 107, 0.06);
}

.app-top-nav__user-label {
  display: flex;
  align-items: center;
  gap: 0.625rem;
}

.app-top-nav__avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  background: linear-gradient(135deg, #28536b, #6c8f7d);
  border-radius: 50%;
  color: #ffffff;
  font-size: 0.75rem;
  font-weight: 600;
}

.app-top-nav__user-name {
  color: #14323f;
  font-weight: 500;
}

.app-top-nav__menu {
  min-width: 220px;
}

.app-top-nav__menu-header {
  padding: 1rem;
}

.app-top-nav__menu-name {
  color: #14323f;
  font-weight: 600;
  font-size: 0.9375rem;
}

.app-top-nav__sign-out:hover {
  background: rgba(183, 80, 63, 0.06);
}
</style>
