<script setup lang="ts">
import { useI18n } from "vue-i18n";

const { t } = useI18n();
</script>

<template>
  <q-layout view="lHh Lpr lFf">
    <q-page-container>
      <q-page class="auth-layout">
        <section class="auth-layout__hero">
          <p class="auth-layout__eyebrow">{{ t("app.name") }}</p>
          <h1 class="auth-layout__title">{{ t("app.tagline") }}</h1>
          <p class="auth-layout__summary">
            {{ t("shell.summary") }}
          </p>
        </section>

        <RouterView />
      </q-page>
    </q-page-container>
  </q-layout>
</template>

<style scoped>
.auth-layout {
  display: grid;
  grid-template-columns: minmax(0, 28rem) minmax(0, 32rem);
  align-items: center;
  justify-content: center;
  gap: 3rem;
  min-height: 100vh;
  padding: 2rem;
  background:
    radial-gradient(circle at top left, rgba(207, 124, 76, 0.24), transparent 28%),
    radial-gradient(circle at bottom right, rgba(108, 143, 125, 0.28), transparent 35%),
    linear-gradient(135deg, #f7f4ee 0%, #eef4f1 100%);
}

.auth-layout__hero {
  max-width: 28rem;
}

.auth-layout__eyebrow {
  margin: 0 0 0.75rem;
  color: #cf7c4c;
  font-size: 0.85rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.auth-layout__title {
  margin: 0;
  color: #14323f;
  font-family: "Newsreader", serif;
  font-size: clamp(2.5rem, 7vw, 4.75rem);
  line-height: 0.95;
}

.auth-layout__summary {
  margin: 1.25rem 0 0;
  color: #46616d;
  font-size: 1rem;
  line-height: 1.7;
}

@media (max-width: 900px) {
  .auth-layout {
    grid-template-columns: 1fr;
    gap: 2rem;
    padding: 1.5rem;
  }
}
</style>
