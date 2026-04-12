<script setup lang="ts">
import { computed, reactive, watch } from "vue";
import { useI18n } from "vue-i18n";

import type { PatientRecord, PatientUpsertPayload } from "../types";

const props = defineProps<{
  loading: boolean;
  modelValue: boolean;
  patient?: PatientRecord | null;
  submitLabel: string;
  title: string;
}>();

const emit = defineEmits<{
  "submit": [payload: PatientUpsertPayload];
  "update:modelValue": [value: boolean];
}>();

const { t } = useI18n();

const form = reactive({
  dateOfBirth: "",
  fullName: "",
  notes: "",
});

const isEditing = computed(() => Boolean(props.patient));

const syncForm = () => {
  form.dateOfBirth = props.patient?.dateOfBirth ?? "";
  form.fullName = props.patient?.fullName ?? "";
  form.notes = props.patient?.notes ?? "";
};

watch(
  () => props.modelValue,
  (isOpen) => {
    if (isOpen) {
      syncForm();
    }
  },
);

watch(
  () => props.patient,
  () => {
    if (props.modelValue) {
      syncForm();
    }
  },
);

const closeDialog = () => {
  emit("update:modelValue", false);
};

const handleSubmit = () => {
  emit("submit", {
    dateOfBirth: form.dateOfBirth || null,
    fullName: form.fullName.trim(),
    notes: form.notes.trim() || null,
  });
};
</script>

<template>
  <q-dialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <q-card class="patient-form-dialog">
      <q-card-section class="patient-form-dialog__header">
        <div>
          <p class="patient-form-dialog__eyebrow">
            {{ isEditing ? $t("patients.editEyebrow") : $t("patients.createEyebrow") }}
          </p>
          <h2 class="patient-form-dialog__title">{{ title }}</h2>
        </div>
        <q-btn
          flat
          round
          dense
          icon="close"
          :aria-label="$t('patients.closeForm')"
          @click="closeDialog"
        />
      </q-card-section>

      <q-card-section>
        <q-form
          class="patient-form-dialog__form"
          @submit.prevent="handleSubmit"
        >
          <q-input
            v-model="form.fullName"
            outlined
            autocomplete="name"
            :disable="loading"
            :label="$t('patients.fields.fullName')"
            :rules="[
              (value) =>
                Boolean(String(value).trim()) || t('patients.validation.fullNameRequired'),
            ]"
          />
          <q-input
            v-model="form.dateOfBirth"
            outlined
            type="date"
            :disable="loading"
            :label="$t('patients.fields.dateOfBirth')"
          />
          <q-input
            v-model="form.notes"
            outlined
            autogrow
            type="textarea"
            :disable="loading"
            :label="$t('patients.fields.notes')"
          />
          <div class="patient-form-dialog__actions">
            <q-btn
              flat
              no-caps
              :disable="loading"
              :label="$t('patients.cancel')"
              @click="closeDialog"
            />
            <q-btn
              color="primary"
              type="submit"
              unelevated
              no-caps
              :loading="loading"
              :label="submitLabel"
            />
          </div>
        </q-form>
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<style scoped>
.patient-form-dialog {
  width: min(36rem, calc(100vw - 2rem));
  border-radius: 1.5rem;
}

.patient-form-dialog__header {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 1rem;
}

.patient-form-dialog__eyebrow {
  margin: 0 0 0.35rem;
  color: #6c8f7d;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.patient-form-dialog__title {
  margin: 0;
  color: #14323f;
  font-family: "Newsreader", serif;
  font-size: 2rem;
}

.patient-form-dialog__form {
  display: grid;
  gap: 1rem;
}

.patient-form-dialog__actions {
  display: flex;
  justify-content: end;
  gap: 0.75rem;
  margin-top: 0.5rem;
}
</style>
