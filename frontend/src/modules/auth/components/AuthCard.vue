<script setup lang="ts">
defineProps<{
  eyebrow: string;
  title: string;
}>();
</script>

<template>
  <section class="auth-card">
    <p class="auth-card__eyebrow">{{ eyebrow }}</p>
    <h1 class="auth-card__title">{{ title }}</h1>
    <div class="auth-card__content">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.auth-card {
  width: min(100%, 32rem);
  padding: 2rem;
  border-radius: 1.5rem;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(244, 239, 231, 0.94));
  box-shadow: 0 1.5rem 3rem rgba(20, 50, 63, 0.12);
  backdrop-filter: blur(12px);
}

.auth-card__eyebrow {
  margin: 0 0 0.75rem;
  color: #cf7c4c;
  font-size: 0.85rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.auth-card__title {
  margin: 0;
  color: #14323f;
  font-family: "Newsreader", serif;
  font-size: clamp(2rem, 5vw, 3rem);
  line-height: 1;
}

.auth-card__content {
  margin-top: 1.5rem;
}
</style>
