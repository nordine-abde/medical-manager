<script setup lang="ts">
import { reactive, ref } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useI18n } from "vue-i18n";

import AuthCard from "../components/AuthCard.vue";
import { useAuthStore } from "../store";

const authStore = useAuthStore();
const route = useRoute();
const router = useRouter();
const { t } = useI18n();

const form = reactive({
  email: "",
  password: "",
});
const errorMessage = ref("");
const isSubmitting = ref(false);

const handleSubmit = async () => {
  errorMessage.value = "";
  isSubmitting.value = true;

  try {
    await authStore.signIn(form);

    const redirectTarget =
      typeof route.query.redirect === "string"
        ? route.query.redirect
        : "/app/patients";

    await router.replace(redirectTarget);
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : t("auth.genericError");
  } finally {
    isSubmitting.value = false;
  }
};
</script>

<template>
  <AuthCard
    :eyebrow="t('auth.eyebrow')"
    :title="t('auth.signInTitle')"
  >
    <q-form
      class="auth-form"
      @submit.prevent="handleSubmit"
    >
      <q-banner
        v-if="errorMessage"
        class="auth-form__banner"
        rounded
        inline-actions
      >
        {{ errorMessage }}
      </q-banner>
      <q-input
        v-model="form.email"
        outlined
        type="email"
        autocomplete="email"
        :label="t('auth.email')"
        :disable="isSubmitting"
        :rules="[
          (value) => Boolean(value) || t('auth.validation.emailRequired'),
        ]"
      />
      <q-input
        v-model="form.password"
        outlined
        type="password"
        autocomplete="current-password"
        :label="t('auth.password')"
        :disable="isSubmitting"
        :rules="[
          (value) => Boolean(value) || t('auth.validation.passwordRequired'),
        ]"
      />
      <q-btn
        class="auth-form__submit"
        color="primary"
        type="submit"
        unelevated
        no-caps
        :loading="isSubmitting"
        :label="t('auth.signIn')"
      />
      <RouterLink
        class="auth-form__link"
        to="/auth/sign-up"
      >
        {{ t("auth.switchToSignUp") }}
      </RouterLink>
      <p class="auth-form__helper">
        {{ t("auth.helper") }}
      </p>
    </q-form>
  </AuthCard>
</template>

<style scoped>
.auth-form {
  display: grid;
  gap: 1rem;
}

.auth-form__submit {
  min-height: 3rem;
  margin-top: 0.25rem;
  border-radius: 999px;
}

.auth-form__banner {
  background: rgba(183, 80, 63, 0.14);
  color: #7f2e22;
}

.auth-form__link {
  color: #28536b;
  font-weight: 700;
  text-decoration: none;
}

.auth-form__helper {
  margin: 0;
  color: #50666f;
  font-size: 0.95rem;
  line-height: 1.5;
}
</style>
