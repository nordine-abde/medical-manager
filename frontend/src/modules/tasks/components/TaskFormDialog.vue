<script setup lang="ts">
import { computed, reactive, watch } from "vue";
import { useI18n } from "vue-i18n";

import {
  taskWorkflowStatuses,
  type TaskRecord,
  type TaskUpsertPayload,
  type TaskWorkflowStatus,
} from "../types";

interface SelectOption {
  label: string;
  value: string | null;
}

const props = defineProps<{
  conditionOptions: SelectOption[];
  instructionOptions: SelectOption[];
  loading: boolean;
  modelValue: boolean;
  submitLabel: string;
  task?: TaskRecord | null;
  title: string;
}>();

const emit = defineEmits<{
  submit: [payload: TaskUpsertPayload, status: TaskWorkflowStatus | null];
  "update:modelValue": [value: boolean];
}>();

const { t } = useI18n();

const form = reactive({
  conditionId: null as string | null,
  description: "",
  dueDate: "",
  medicalInstructionId: null as string | null,
  scheduledAt: "",
  status: "pending" as TaskWorkflowStatus,
  taskType: "",
  title: "",
});

const isEditing = computed(() => Boolean(props.task));

const statusOptions = computed(() =>
  taskWorkflowStatuses.map((status) => ({
    label: t(`tasks.statuses.${status}`),
    value: status,
  })),
);

const toInputDateTime = (value: string | null): string => {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60_000);
  return localDate.toISOString().slice(0, 16);
};

const toIsoDateTime = (value: string): string | null => {
  if (!value.trim()) {
    return null;
  }

  return new Date(value).toISOString();
};

const syncForm = () => {
  form.conditionId = props.task?.conditionId ?? null;
  form.description = props.task?.description ?? "";
  form.dueDate = props.task?.dueDate ?? "";
  form.medicalInstructionId = props.task?.medicalInstructionId ?? null;
  form.scheduledAt = toInputDateTime(props.task?.scheduledAt ?? null);
  form.status = props.task?.status === "blocked" ? "pending" : (props.task?.status ?? "pending");
  form.taskType = props.task?.taskType ?? "";
  form.title = props.task?.title ?? "";
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
  () => props.task,
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
  emit(
    "submit",
    {
      conditionId: form.conditionId,
      description: form.description.trim() || null,
      dueDate: form.dueDate || null,
      medicalInstructionId: form.medicalInstructionId,
      scheduledAt: toIsoDateTime(form.scheduledAt),
      taskType: form.taskType.trim(),
      title: form.title.trim(),
    },
    isEditing.value ? form.status : null,
  );
};
</script>

<template>
  <q-dialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <q-card class="task-form-dialog">
      <q-card-section class="task-form-dialog__header">
        <div>
          <p class="task-form-dialog__eyebrow">
            {{ isEditing ? $t("tasks.editEyebrow") : $t("tasks.createEyebrow") }}
          </p>
          <h2 class="task-form-dialog__title">{{ title }}</h2>
        </div>
        <q-btn
          flat
          round
          dense
          icon="close"
          :aria-label="$t('tasks.closeForm')"
          @click="closeDialog"
        />
      </q-card-section>

      <q-card-section>
        <q-form
          class="task-form-dialog__form"
          @submit.prevent="handleSubmit"
        >
          <div class="task-form-dialog__grid">
            <q-input
              v-model="form.title"
              outlined
              autocomplete="off"
              :disable="loading"
              :label="$t('tasks.fields.title')"
              :rules="[
                (value) =>
                  Boolean(String(value).trim()) || t('tasks.validation.titleRequired'),
              ]"
            />
            <q-input
              v-model="form.taskType"
              outlined
              autocomplete="off"
              :disable="loading"
              :label="$t('tasks.fields.taskType')"
              :rules="[
                (value) =>
                  Boolean(String(value).trim()) || t('tasks.validation.taskTypeRequired'),
              ]"
            />
            <q-input
              v-model="form.dueDate"
              outlined
              type="date"
              :disable="loading"
              :label="$t('tasks.fields.dueDate')"
            />
            <q-input
              v-model="form.scheduledAt"
              outlined
              type="datetime-local"
              :disable="loading"
              :label="$t('tasks.fields.scheduledAt')"
            />
            <q-select
              v-model="form.medicalInstructionId"
              outlined
              clearable
              emit-value
              map-options
              :disable="loading"
              :label="$t('tasks.fields.medicalInstruction')"
              :options="instructionOptions"
            />
            <q-select
              v-model="form.conditionId"
              outlined
              clearable
              emit-value
              map-options
              :disable="loading"
              :label="$t('tasks.fields.condition')"
              :options="conditionOptions"
            />
            <q-select
              v-if="isEditing"
              v-model="form.status"
              outlined
              emit-value
              map-options
              :disable="loading"
              :label="$t('tasks.fields.status')"
              :options="statusOptions"
            />
          </div>

          <q-input
            v-model="form.description"
            outlined
            autogrow
            type="textarea"
            :disable="loading"
            :label="$t('tasks.fields.description')"
          />

          <div class="task-form-dialog__actions">
            <q-btn
              flat
              no-caps
              :disable="loading"
              :label="$t('tasks.cancel')"
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
.task-form-dialog {
  width: min(52rem, calc(100vw - 2rem));
  border-radius: 1.5rem;
}

.task-form-dialog__header {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 1rem;
}

.task-form-dialog__eyebrow {
  margin: 0 0 0.35rem;
  color: #6c8f7d;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.task-form-dialog__title {
  margin: 0;
  color: #14323f;
  font-family: "Newsreader", serif;
  font-size: 2rem;
}

.task-form-dialog__form {
  display: grid;
  gap: 1rem;
}

.task-form-dialog__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.task-form-dialog__actions {
  display: flex;
  justify-content: end;
  gap: 0.75rem;
  margin-top: 0.5rem;
}

@media (max-width: 720px) {
  .task-form-dialog__grid {
    grid-template-columns: 1fr;
  }
}
</style>
