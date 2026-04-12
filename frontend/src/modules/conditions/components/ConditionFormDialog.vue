<script setup lang="ts">
import { computed, reactive, watch } from "vue";
import { useI18n } from "vue-i18n";

import type { ConditionRecord, ConditionUpsertPayload } from "../types";

const props = defineProps<{
  condition?: ConditionRecord | null;
  loading: boolean;
  modelValue: boolean;
  submitLabel: string;
  title: string;
}>();

const emit = defineEmits<{
  "submit": [payload: ConditionUpsertPayload];
  "update:modelValue": [value: boolean];
}>();

const { t } = useI18n();

const form = reactive({
  active: true,
  name: "",
  notes: "",
});

const isEditing = computed(() => Boolean(props.condition));

const syncForm = () => {
  form.active = props.condition?.active ?? true;
  form.name = props.condition?.name ?? "";
  form.notes = props.condition?.notes ?? "";
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
  () => props.condition,
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
    active: form.active,
    name: form.name.trim(),
    notes: form.notes.trim() || null,
  });
};
</script>

<template>
  <q-dialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <q-card class="condition-form-dialog">
      <q-card-section class="condition-form-dialog__header">
        <div>
          <p class="condition-form-dialog__eyebrow">
            {{
              isEditing
                ? $t("conditions.editEyebrow")
                : $t("conditions.createEyebrow")
            }}
          </p>
          <h2 class="condition-form-dialog__title">{{ title }}</h2>
        </div>
        <q-btn
          flat
          round
          dense
          icon="close"
          :aria-label="$t('conditions.closeForm')"
          @click="closeDialog"
        />
      </q-card-section>

      <q-card-section>
        <q-form
          class="condition-form-dialog__form"
          @submit.prevent="handleSubmit"
        >
          <q-input
            v-model="form.name"
            outlined
            autocomplete="off"
            :disable="loading"
            :label="$t('conditions.fields.name')"
            :rules="[
              (value) =>
                Boolean(String(value).trim()) || t('conditions.validation.nameRequired'),
            ]"
          />
          <q-input
            v-model="form.notes"
            outlined
            autogrow
            type="textarea"
            :disable="loading"
            :label="$t('conditions.fields.notes')"
          />
          <q-toggle
            v-model="form.active"
            checked-icon="check"
            color="positive"
            keep-color
            unchecked-icon="pause"
            :disable="loading"
            :label="
              form.active ? $t('conditions.activeLabel') : $t('conditions.inactiveLabel')
            "
          />
          <div class="condition-form-dialog__actions">
            <q-btn
              flat
              no-caps
              :disable="loading"
              :label="$t('conditions.cancel')"
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
.condition-form-dialog {
  width: min(34rem, calc(100vw - 2rem));
  border-radius: 1.5rem;
}

.condition-form-dialog__header {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 1rem;
}

.condition-form-dialog__eyebrow {
  margin: 0 0 0.35rem;
  color: #6c8f7d;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.condition-form-dialog__title {
  margin: 0;
  color: #14323f;
  font-family: "Newsreader", serif;
  font-size: 2rem;
}

.condition-form-dialog__form {
  display: grid;
  gap: 1rem;
}

.condition-form-dialog__actions {
  display: flex;
  justify-content: end;
  gap: 0.75rem;
  margin-top: 0.5rem;
}
</style>
