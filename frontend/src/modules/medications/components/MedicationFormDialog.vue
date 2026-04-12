<script setup lang="ts">
import { computed, reactive, watch } from "vue";

import type { MedicationRecord, MedicationUpsertPayload } from "../types";

interface SelectOption {
  label: string;
  value: string | null;
}

const props = defineProps<{
  conditionOptions: SelectOption[];
  loading: boolean;
  medication?: MedicationRecord | null;
  modelValue: boolean;
  submitLabel: string;
  title: string;
}>();

const emit = defineEmits<{
  submit: [payload: MedicationUpsertPayload];
  "update:modelValue": [value: boolean];
}>();

const form = reactive({
  conditionId: null as string | null,
  dosage: "",
  name: "",
  nextGpContactDate: "",
  notes: "",
  prescribingDoctor: "",
  quantity: "",
  renewalCadence: "",
});

const isEditing = computed(() => Boolean(props.medication));

const syncForm = () => {
  form.conditionId = props.medication?.conditionId ?? null;
  form.dosage = props.medication?.dosage ?? "";
  form.name = props.medication?.name ?? "";
  form.nextGpContactDate = props.medication?.nextGpContactDate ?? "";
  form.notes = props.medication?.notes ?? "";
  form.prescribingDoctor = props.medication?.prescribingDoctor ?? "";
  form.quantity = props.medication?.quantity ?? "";
  form.renewalCadence = props.medication?.renewalCadence ?? "";
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
  () => props.medication,
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
    conditionId: form.conditionId,
    dosage: form.dosage.trim(),
    name: form.name.trim(),
    nextGpContactDate: form.nextGpContactDate || null,
    notes: form.notes.trim() || null,
    prescribingDoctor: form.prescribingDoctor.trim() || null,
    quantity: form.quantity.trim(),
    renewalCadence: form.renewalCadence.trim() || null,
  });
};
</script>

<template>
  <q-dialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <q-card class="medication-form-dialog">
      <q-card-section class="medication-form-dialog__header">
        <div>
          <p class="medication-form-dialog__eyebrow">
            {{
              isEditing
                ? $t("medications.editEyebrow")
                : $t("medications.createEyebrow")
            }}
          </p>
          <h2 class="medication-form-dialog__title">{{ title }}</h2>
        </div>
        <q-btn
          flat
          round
          dense
          icon="close"
          :aria-label="$t('medications.closeForm')"
          @click="closeDialog"
        />
      </q-card-section>

      <q-card-section>
        <q-form
          class="medication-form-dialog__form"
          @submit.prevent="handleSubmit"
        >
          <div class="medication-form-dialog__grid">
            <q-input
              v-model="form.name"
              outlined
              autocomplete="off"
              :disable="loading"
              :label="$t('medications.fields.name')"
              :rules="[
                (value) =>
                  Boolean(String(value).trim()) || $t('medications.validation.nameRequired'),
              ]"
            />
            <q-select
              v-model="form.conditionId"
              outlined
              clearable
              emit-value
              map-options
              :disable="loading"
              :label="$t('medications.fields.condition')"
              :options="conditionOptions"
            />
            <q-input
              v-model="form.dosage"
              outlined
              autocomplete="off"
              :disable="loading"
              :label="$t('medications.fields.dosage')"
              :rules="[
                (value) =>
                  Boolean(String(value).trim()) || $t('medications.validation.dosageRequired'),
              ]"
            />
            <q-input
              v-model="form.quantity"
              outlined
              autocomplete="off"
              :disable="loading"
              :label="$t('medications.fields.quantity')"
              :rules="[
                (value) =>
                  Boolean(String(value).trim()) || $t('medications.validation.quantityRequired'),
              ]"
            />
            <q-input
              v-model="form.nextGpContactDate"
              outlined
              type="date"
              :disable="loading"
              :label="$t('medications.fields.nextGpContactDate')"
            />
            <q-input
              v-model="form.renewalCadence"
              outlined
              autocomplete="off"
              :disable="loading"
              :label="$t('medications.fields.renewalCadence')"
            />
            <q-input
              v-model="form.prescribingDoctor"
              outlined
              autocomplete="off"
              :disable="loading"
              :label="$t('medications.fields.prescribingDoctor')"
            />
            <q-input
              v-model="form.notes"
              outlined
              autogrow
              type="textarea"
              :disable="loading"
              :label="$t('medications.fields.notes')"
            />
          </div>
          <div class="medication-form-dialog__actions">
            <q-btn
              flat
              no-caps
              :disable="loading"
              :label="$t('medications.cancel')"
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
.medication-form-dialog {
  width: min(42rem, calc(100vw - 2rem));
  border-radius: 1.5rem;
}

.medication-form-dialog__header {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 1rem;
}

.medication-form-dialog__eyebrow {
  margin: 0 0 0.35rem;
  color: #6c8f7d;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.medication-form-dialog__title {
  margin: 0;
  color: #14323f;
  font-family: "Newsreader", serif;
  font-size: 2rem;
}

.medication-form-dialog__form {
  display: grid;
  gap: 1rem;
}

.medication-form-dialog__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.medication-form-dialog__actions {
  display: flex;
  justify-content: end;
  gap: 0.75rem;
  margin-top: 0.5rem;
}

@media (max-width: 720px) {
  .medication-form-dialog__grid {
    grid-template-columns: 1fr;
  }
}
</style>
