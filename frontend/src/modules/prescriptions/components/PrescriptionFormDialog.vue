<script setup lang="ts">
import { computed, reactive, watch } from "vue";
import { useI18n } from "vue-i18n";

import type { TaskUpsertPayload } from "../../tasks/types";
import {
  prescriptionStatuses,
  prescriptionTypes,
  type PrescriptionRecord,
  type PrescriptionStatus,
  type PrescriptionType,
  type PrescriptionUpsertPayload,
} from "../types";

interface SelectOption {
  label: string;
  value: string | null;
}

interface PrescriptionFormSubmitPayload {
  document:
    | {
        file: File;
        notes: string | null;
      }
    | null;
  inlineTask: TaskUpsertPayload | null;
  prescription: PrescriptionUpsertPayload;
  statusPayload: {
    collectedAt?: string | null;
    receivedAt?: string | null;
    requestedAt?: string | null;
    status: PrescriptionStatus;
  };
}

const props = defineProps<{
  loading: boolean;
  modelValue: boolean;
  prescription?: PrescriptionRecord | null;
  submitLabel: string;
  subtypeOptionsByType: Record<PrescriptionType, string[]>;
  taskOptions: SelectOption[];
  title: string;
}>();

const emit = defineEmits<{
  submit: [payload: PrescriptionFormSubmitPayload];
  "update:modelValue": [value: boolean];
}>();

const { t } = useI18n();

const form = reactive({
  collectedAt: "",
  createInlineTask: false,
  documentFile: null as File | null,
  documentNotes: "",
  expirationDate: "",
  inlineTaskDescription: "",
  inlineTaskDueDate: "",
  inlineTaskTitle: "",
  inlineTaskType: "",
  issueDate: "",
  notes: "",
  prescriptionType: "medication" as PrescriptionUpsertPayload["prescriptionType"],
  receivedAt: "",
  requestedAt: "",
  status: "needed" as PrescriptionStatus,
  subtype: "",
  subtypeInput: "",
  taskId: null as string | null,
});

const isEditing = computed(() => Boolean(props.prescription));

const typeOptions = computed(() =>
  prescriptionTypes.map((type) => ({
    label: t(`prescriptions.types.${type}`),
    value: type,
  })),
);

const statusOptions = computed(() =>
  prescriptionStatuses.map((status) => ({
    label: t(`prescriptions.statuses.${status}`),
    value: status,
  })),
);

const subtypeOptions = computed(
  () => props.subtypeOptionsByType[form.prescriptionType] ?? [],
);

const normalizeSubtypeValue = (value: string | null | undefined): string =>
  value?.trim() ?? "";

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

const buildDefaultInlineTaskTitle = (): string =>
  t("prescriptions.defaultInlineTaskTitle", {
    subtype:
      form.subtype.trim() || t(`prescriptions.types.${form.prescriptionType}`),
  });

const syncForm = () => {
  form.collectedAt = toInputDateTime(props.prescription?.collectedAt ?? null);
  form.createInlineTask = false;
  form.documentFile = null;
  form.documentNotes = "";
  form.expirationDate = props.prescription?.expirationDate ?? "";
  form.inlineTaskDescription = "";
  form.inlineTaskDueDate = "";
  form.inlineTaskTitle = "";
  form.inlineTaskType = "";
  form.issueDate = props.prescription?.issueDate ?? "";
  form.notes = props.prescription?.notes ?? "";
  form.prescriptionType = props.prescription?.prescriptionType ?? "medication";
  form.receivedAt = toInputDateTime(props.prescription?.receivedAt ?? null);
  form.requestedAt = toInputDateTime(props.prescription?.requestedAt ?? null);
  form.status = props.prescription?.status ?? "needed";
  form.subtype = normalizeSubtypeValue(props.prescription?.subtype);
  form.subtypeInput = form.subtype;
  form.taskId = props.prescription?.taskId ?? null;
};

watch(
  () => form.subtype,
  (subtype) => {
    form.subtypeInput = subtype;
  },
);

watch(
  () => props.modelValue,
  (isOpen) => {
    if (isOpen) {
      syncForm();
    }
  },
);

watch(
  () => props.prescription,
  () => {
    if (props.modelValue) {
      syncForm();
    }
  },
);

watch(
  () => form.createInlineTask,
  (createInlineTask) => {
    if (!createInlineTask) {
      return;
    }

    form.taskId = null;

    if (!form.inlineTaskTitle.trim()) {
      form.inlineTaskTitle = buildDefaultInlineTaskTitle();
    }

    if (!form.inlineTaskType.trim()) {
      form.inlineTaskType = "prescription_follow_up";
    }
  },
);

const closeDialog = () => {
  emit("update:modelValue", false);
};

const commitSubtypeInput = () => {
  const subtype = normalizeSubtypeValue(form.subtypeInput);
  form.subtype = subtype;
  form.subtypeInput = subtype;
};

const handleSubtypeInputValue = (value: string | number | null) => {
  form.subtypeInput = String(value ?? "");
};

const handleSubtypeNewValue = (
  value: string,
  done: (value?: string, mode?: "add" | "add-unique" | "toggle") => void,
) => {
  const subtype = normalizeSubtypeValue(value);

  form.subtype = subtype;
  form.subtypeInput = subtype;
  done(subtype, "add-unique");
};

const handleSubmit = () => {
  commitSubtypeInput();

  emit("submit", {
    document:
      form.documentFile instanceof File
        ? {
            file: form.documentFile,
            notes: form.documentNotes.trim() || null,
          }
        : null,
    inlineTask: form.createInlineTask
      ? {
          conditionId: null,
          description: form.inlineTaskDescription.trim() || null,
          dueDate: form.inlineTaskDueDate || null,
          medicalInstructionId: null,
          scheduledAt: null,
          taskType: form.inlineTaskType.trim(),
          title: form.inlineTaskTitle.trim(),
        }
      : null,
    prescription: {
      expirationDate: form.expirationDate || null,
      issueDate: form.issueDate || null,
      notes: form.notes.trim() || null,
      prescriptionType: form.prescriptionType,
      status: form.status,
      subtype: normalizeSubtypeValue(form.subtype),
      taskId: form.taskId,
    },
    statusPayload: {
      collectedAt: toIsoDateTime(form.collectedAt),
      receivedAt: toIsoDateTime(form.receivedAt),
      requestedAt: toIsoDateTime(form.requestedAt),
      status: form.status,
    },
  });
};
</script>

<template>
  <q-dialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <q-card class="prescription-form-dialog">
      <q-card-section class="prescription-form-dialog__header">
        <div>
          <p class="prescription-form-dialog__eyebrow">
            {{
              isEditing
                ? $t("prescriptions.editEyebrow")
                : $t("prescriptions.createEyebrow")
            }}
          </p>
          <h2 class="prescription-form-dialog__title">{{ title }}</h2>
        </div>
        <q-btn
          flat
          round
          dense
          icon="close"
          :aria-label="$t('prescriptions.closeForm')"
          @click="closeDialog"
        />
      </q-card-section>

      <q-card-section>
        <q-form
          class="prescription-form-dialog__form"
          @submit.prevent="handleSubmit"
        >
          <div class="prescription-form-dialog__grid">
            <q-select
              v-model="form.prescriptionType"
              outlined
              emit-value
              map-options
              :disable="loading"
              :label="$t('prescriptions.fields.prescriptionType')"
              :options="typeOptions"
            />
            <q-select
              v-model="form.status"
              outlined
              emit-value
              map-options
              :disable="loading"
              :label="$t('prescriptions.fields.status')"
              :options="statusOptions"
            />
            <q-select
              v-model="form.subtype"
              :input-value="form.subtypeInput"
              outlined
              use-input
              hide-selected
              fill-input
              new-value-mode="add-unique"
              :disable="loading"
              :hint="$t('prescriptions.subtypeHint')"
              :label="$t('prescriptions.fields.subtype')"
              :options="subtypeOptions"
              @blur="commitSubtypeInput"
              @new-value="handleSubtypeNewValue"
              @update:input-value="handleSubtypeInputValue"
              :rules="[
                (value) =>
                  Boolean(String(value ?? '').trim()) ||
                  $t('prescriptions.validation.subtypeRequired'),
              ]"
            />
            <q-input
              v-model="form.issueDate"
              outlined
              type="date"
              :disable="loading"
              :label="$t('prescriptions.fields.issueDate')"
            />
            <q-input
              v-model="form.expirationDate"
              outlined
              type="date"
              :disable="loading"
              :label="$t('prescriptions.fields.expirationDate')"
            />
            <q-input
              v-model="form.requestedAt"
              outlined
              type="datetime-local"
              :disable="loading"
              :label="$t('prescriptions.fields.requestedAt')"
            />
            <q-input
              v-model="form.receivedAt"
              outlined
              type="datetime-local"
              :disable="loading"
              :label="$t('prescriptions.fields.receivedAt')"
            />
            <q-input
              v-model="form.collectedAt"
              outlined
              type="datetime-local"
              :disable="loading"
              :label="$t('prescriptions.fields.collectedAt')"
            />
            <q-select
              v-model="form.taskId"
              outlined
              clearable
              emit-value
              map-options
              :disable="loading || form.createInlineTask"
              :label="$t('prescriptions.fields.task')"
              :options="taskOptions"
            />
          </div>

          <q-input
            v-model="form.notes"
            outlined
            autogrow
            type="textarea"
            :disable="loading"
            :label="$t('prescriptions.fields.notes')"
          />

          <q-card
            flat
            class="prescription-form-dialog__section-card"
          >
            <q-card-section class="prescription-form-dialog__section-grid">
              <q-toggle
                v-model="form.createInlineTask"
                :disable="loading"
                :label="$t('prescriptions.createTaskInline')"
              />

              <template v-if="form.createInlineTask">
                <q-input
                  v-model="form.inlineTaskTitle"
                  outlined
                  :disable="loading"
                  :label="$t('prescriptions.inlineTask.fields.title')"
                  :rules="[
                    (value) =>
                      Boolean(String(value ?? '').trim()) ||
                      $t('prescriptions.inlineTask.validation.titleRequired'),
                  ]"
                />
                <q-input
                  v-model="form.inlineTaskType"
                  outlined
                  :disable="loading"
                  :label="$t('prescriptions.inlineTask.fields.taskType')"
                  :rules="[
                    (value) =>
                      Boolean(String(value ?? '').trim()) ||
                      $t('prescriptions.inlineTask.validation.taskTypeRequired'),
                  ]"
                />
                <q-input
                  v-model="form.inlineTaskDueDate"
                  outlined
                  type="date"
                  :disable="loading"
                  :label="$t('prescriptions.inlineTask.fields.dueDate')"
                />
                <q-input
                  v-model="form.inlineTaskDescription"
                  outlined
                  autogrow
                  type="textarea"
                  :disable="loading"
                  :label="$t('prescriptions.inlineTask.fields.description')"
                />
              </template>
            </q-card-section>
          </q-card>

          <q-card
            flat
            class="prescription-form-dialog__section-card"
          >
            <q-card-section class="prescription-form-dialog__section-grid">
              <p class="prescription-form-dialog__section-title">
                {{ $t("prescriptions.documentSectionTitle") }}
              </p>
              <q-file
                v-model="form.documentFile"
                clearable
                outlined
                accept="application/pdf,image/jpeg,image/png,image/webp"
                :disable="loading"
                :label="$t('prescriptions.document.fields.file')"
              />
              <q-input
                v-model="form.documentNotes"
                outlined
                autogrow
                type="textarea"
                :disable="loading"
                :label="$t('prescriptions.document.fields.notes')"
              />
            </q-card-section>
          </q-card>

          <div class="prescription-form-dialog__actions">
            <q-btn
              flat
              no-caps
              :disable="loading"
              :label="$t('prescriptions.cancel')"
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
.prescription-form-dialog {
  width: min(54rem, calc(100vw - 2rem));
  border-radius: 1.5rem;
}

.prescription-form-dialog__header {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 1rem;
}

.prescription-form-dialog__eyebrow {
  margin: 0 0 0.35rem;
  color: #6c8f7d;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.prescription-form-dialog__title {
  margin: 0;
  color: #14323f;
  font-family: "Newsreader", serif;
  font-size: 2rem;
}

.prescription-form-dialog__form {
  display: grid;
  gap: 1rem;
}

.prescription-form-dialog__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.prescription-form-dialog__section-card {
  background: #f5f8f9;
  border-radius: 1rem;
}

.prescription-form-dialog__section-grid {
  display: grid;
  gap: 1rem;
}

.prescription-form-dialog__section-title {
  margin: 0;
  color: #28434d;
  font-size: 0.95rem;
  font-weight: 700;
}

.prescription-form-dialog__actions {
  display: flex;
  justify-content: end;
  gap: 0.75rem;
  margin-top: 0.5rem;
}

@media (max-width: 720px) {
  .prescription-form-dialog__grid {
    grid-template-columns: 1fr;
  }
}
</style>
