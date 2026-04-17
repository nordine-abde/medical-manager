<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { useI18n } from "vue-i18n";

import AppTopNav from "../components/AppTopNav.vue";

const route = useRoute();
const { t } = useI18n();
const drawerOpen = ref(false);

const patientId = computed(() =>
  typeof route.params.patientId === "string" ? route.params.patientId : null,
);

const isPatientRoute = computed(() => Boolean(patientId.value));

const mainNavItems = computed(() => [
  { label: t("nav.patients"), to: "/app/patients", icon: "group" },
  { label: t("nav.tasks"), to: "/app/tasks", icon: "task_alt" },
  { label: t("nav.timeline"), to: "/app/timeline", icon: "schedule" },
  { label: t("nav.settings"), to: "/app/settings", icon: "settings" },
]);

const patientNavItems = computed(() => {
  if (!patientId.value) return [];

  return [
    {
      label: t("nav.overview"),
      to: `/app/patients/${patientId.value}/overview`,
      icon: "insights",
    },
    {
      label: t("nav.careEvents"),
      to: `/app/patients/${patientId.value}/care-events`,
      icon: "history_edu",
    },
    {
      label: t("nav.timeline"),
      to: `/app/patients/${patientId.value}/timeline`,
      icon: "schedule",
    },
    {
      label: t("nav.documents"),
      to: `/app/patients/${patientId.value}/documents`,
      icon: "folder_shared",
    },
    {
      label: t("nav.notifications"),
      to: `/app/patients/${patientId.value}/notifications`,
      icon: "notifications_active",
    },
  ];
});

watch(
  () => route.fullPath,
  () => {
    drawerOpen.value = false;
  },
);
</script>

<template>
  <q-layout view="hHh LpR lFr">
    <AppTopNav
      :menu-open="drawerOpen"
      @toggle-menu="drawerOpen = !drawerOpen"
    />

    <q-drawer
      v-model="drawerOpen"
      show-if-above
      :width="240"
      :breakpoint="768"
      class="app-layout__drawer"
    >
      <div class="app-layout__drawer-content">
        <div class="app-layout__brand">
          <q-icon
            name="local_hospital"
            size="1.75rem"
            class="app-layout__brand-icon"
          />
          <span class="app-layout__brand-text">{{ t("app.name") }}</span>
        </div>

        <nav class="app-layout__nav">
          <div class="app-layout__nav-section">
            <span class="app-layout__nav-label">{{ t("shell.mainNav") }}</span>
            <RouterLink
              v-for="item in mainNavItems"
              :key="item.to"
              class="app-layout__nav-item"
              :class="{ 'app-layout__nav-item--active': route.path === item.to }"
              :to="item.to"
            >
              <q-icon
                :name="item.icon"
                size="1.25rem"
              />
              <span>{{ item.label }}</span>
            </RouterLink>
          </div>

          <div
            v-if="isPatientRoute"
            class="app-layout__nav-section"
          >
            <div class="app-layout__patient-divider" />
            <span class="app-layout__nav-label">{{ t("shell.patientNav") }}</span>
            <div class="app-layout__patient-badge">
              <q-icon name="person" size="0.875rem" />
              <span class="app-layout__patient-id">{{ t("shell.currentPatient") }}</span>
            </div>
            <RouterLink
              v-for="item in patientNavItems"
              :key="item.to"
              class="app-layout__nav-item"
              :class="{ 'app-layout__nav-item--active': route.path === item.to }"
              :to="item.to"
            >
              <q-icon
                :name="item.icon"
                size="1.25rem"
              />
              <span>{{ item.label }}</span>
            </RouterLink>
          </div>
        </nav>
      </div>
    </q-drawer>

    <q-page-container class="app-layout__container">
      <main class="app-layout__main">
        <RouterView />
      </main>
    </q-page-container>
  </q-layout>
</template>

<style scoped>
.app-layout__drawer {
  background: #ffffff;
  border-right: 1px solid rgba(20, 50, 63, 0.08);
}

.app-layout__drawer-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 1.5rem 1rem;
}

.app-layout__brand {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0 0.75rem 1.5rem;
  margin-bottom: 0.5rem;
  border-bottom: 1px solid rgba(20, 50, 63, 0.06);
}

.app-layout__brand-icon {
  color: #28536b;
}

.app-layout__brand-text {
  color: #14323f;
  font-size: 1.25rem;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.app-layout__nav {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.app-layout__nav-section {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.app-layout__nav-label {
  padding: 0 0.75rem;
  color: #6c8f7d;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.app-layout__nav-item {
  display: flex;
  align-items: center;
  gap: 0.875rem;
  padding: 0.625rem 0.875rem;
  border-radius: 0.625rem;
  color: #4b646f;
  font-size: 0.9375rem;
  font-weight: 500;
  text-decoration: none;
  transition: all 0.2s ease;
}

.app-layout__nav-item:hover {
  background: rgba(40, 83, 107, 0.06);
  color: #28536b;
}

.app-layout__nav-item--active {
  background: rgba(40, 83, 107, 0.1);
  color: #28536b;
  font-weight: 600;
}

.app-layout__nav-item--active::before {
  content: "";
  position: absolute;
  left: 0;
  width: 3px;
  height: 1.5rem;
  background: #28536b;
  border-radius: 0 2px 2px 0;
}

.app-layout__patient-divider {
  height: 1px;
  background: rgba(20, 50, 63, 0.06);
  margin: 0.5rem 0;
}

.app-layout__patient-badge {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0.5rem 0.75rem 0.75rem;
  padding: 0.375rem 0.625rem;
  background: rgba(207, 124, 76, 0.1);
  border-radius: 0.375rem;
  color: #cf7c4c;
  font-size: 0.75rem;
  font-weight: 600;
}

.app-layout__patient-id {
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.app-layout__container {
  background: #f8f9fa;
}

.app-layout__main {
  min-height: calc(100vh - 64px);
  padding: 1.5rem 2rem;
}

@media (max-width: 768px) {
  .app-layout__main {
    padding: 1rem;
  }
}
</style>
