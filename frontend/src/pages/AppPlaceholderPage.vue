<script setup lang="ts">
defineProps<{
  title: string;
  description: string;
}>();
</script>

<template>
  <q-page class="placeholder-page">
    <q-card
      flat
      bordered
      class="placeholder-page__card"
    >
      <q-card-section>
        <p class="placeholder-page__eyebrow">Scaffold</p>
        <h2 class="placeholder-page__title">{{ title }}</h2>
        <p class="placeholder-page__description">{{ description }}</p>
      </q-card-section>
    </q-card>
  </q-page>
</template>

<style scoped>
.placeholder-page__card {
  border-radius: 1.25rem;
  background: rgba(255, 255, 255, 0.9);
}

.placeholder-page__eyebrow {
  margin: 0 0 0.5rem;
  color: #6c8f7d;
  font-size: 0.85rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.placeholder-page__title {
  margin: 0;
  color: #14323f;
  font-family: "Newsreader", serif;
  font-size: 2rem;
}

.placeholder-page__description {
  margin: 0.75rem 0 0;
  color: #4b646f;
  line-height: 1.6;
}
</style>
