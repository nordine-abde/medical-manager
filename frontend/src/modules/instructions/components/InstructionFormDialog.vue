<script setup lang="ts">
import { computed, reactive, watch } from "vue";
import { useI18n } from "vue-i18n";

import {
  instructionStatuses,
  type InstructionRecord,
  type InstructionUpsertPayload,
} from "../types";

const props = defineProps<{
  instruction?: InstructionRecord | null;
  loading: boolean;
  modelValue: boolean;
  submitLabel: string;
  title: string;
}>();

const emit = defineEmits<{
  submit: [payload: InstructionUpsertPayload];
  "update:modelValue": [value: boolean];
}>();

const { t } = useI18n();

const form = reactive({
  doctorName: "",
  instructionDate: "",
  originalNotes: "",
  specialty: "",
  status: "active" as InstructionRecord["status"],
  targetTimingText: "",
});

const isEditing = computed(() => Boolean(props.instruction));

const statusOptions = computed(() =>
  instructionStatuses.map((status) => ({
    label: t(`instructions.statuses.${status}`),
    value: status,
  })),
);

const syncForm = () => {
  form.doctorName = props.instruction?.doctorName ?? "";
  form.instructionDate = props.instruction?.instructionDate ?? "";
  form.originalNotes = props.instruction?.originalNotes ?? "";
  form.specialty = props.instruction?.specialty ?? "";
  form.status = props.instruction?.status ?? "active";
  form.targetTimingText = props.instruction?.targetTimingText ?? "";
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
  () => props.instruction,
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
    doctorName: form.doctorName.trim() || null,
    instructionDate: form.instructionDate,
    originalNotes: form.originalNotes,
    specialty: form.specialty.trim() || null,
    status: form.status,
    targetTimingText: form.targetTimingText.trim() || null,
  });
};
</script>

<template>
  <q-dialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <q-card class="instruction-form-dialog">
      <q-card-section class="instruction-form-dialog__header">
        <div>
          <p class="instruction-form-dialog__eyebrow">
            {{
              isEditing
                ? $t("instructions.editEyebrow")
                : $t("instructions.createEyebrow")
            }}
          </p>
          <h2 class="instruction-form-dialog__title">{{ title }}</h2>
        </div>
        <q-btn
          flat
          round
          dense
          icon="close"
          :aria-label="$t('instructions.closeForm')"
          @click="closeDialog"
        />
      </q-card-section>

      <q-card-section>
        <q-form
          class="instruction-form-dialog__form"
          @submit.prevent="handleSubmit"
        >
          <div class="instruction-form-dialog__grid">
            <q-input
              v-model="form.doctorName"
              outlined
              autocomplete="off"
              :disable="loading"
              :label="$t('instructions.fields.doctorName')"
            />
            <q-input
              v-model="form.specialty"
              outlined
              autocomplete="off"
              :disable="loading"
              :label="$t('instructions.fields.specialty')"
            />
            <q-input
              v-model="form.instructionDate"
              outlined
              type="date"
              :disable="loading"
              :label="$t('instructions.fields.instructionDate')"
              :rules="[
                (value) =>
                  Boolean(String(value).trim()) ||
                  t('instructions.validation.instructionDateRequired'),
              ]"
            />
            <q-select
              v-model="form.status"
              outlined
              emit-value
              map-options
              :disable="loading"
              :label="$t('instructions.fields.status')"
              :options="statusOptions"
            />
          </div>

          <q-input
            v-model="form.targetTimingText"
            outlined
            autogrow
            type="textarea"
            :disable="loading"
            :label="$t('instructions.fields.targetTimingText')"
          />

          <q-input
            v-model="form.originalNotes"
            outlined
            autogrow
            type="textarea"
            :disable="loading"
            :label="$t('instructions.fields.originalNotes')"
            :rules="[
              (value) =>
                Boolean(String(value).trim()) ||
                t('instructions.validation.originalNotesRequired'),
            ]"
          />

          <div class="instruction-form-dialog__actions">
            <q-btn
              flat
              no-caps
              :disable="loading"
              :label="$t('instructions.cancel')"
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
.instruction-form-dialog {
  width: min(46rem, calc(100vw - 2rem));
  border-radius: 1.5rem;
}

.instruction-form-dialog__header {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 1rem;
}

.instruction-form-dialog__eyebrow {
  margin: 0 0 0.35rem;
  color: #6c8f7d;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.instruction-form-dialog__title {
  margin: 0;
  color: #14323f;
  font-family: "Newsreader", serif;
  font-size: 2rem;
}

.instruction-form-dialog__form {
  display: grid;
  gap: 1rem;
}

.instruction-form-dialog__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.instruction-form-dialog__actions {
  display: flex;
  justify-content: end;
  gap: 0.75rem;
  margin-top: 0.5rem;
}

@media (max-width: 720px) {
  .instruction-form-dialog__grid {
    grid-template-columns: 1fr;
  }
}
</style>
