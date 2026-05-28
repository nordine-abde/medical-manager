<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

import { documentTypes } from "../../documents/types";
import {
  type BookingAttachedDocumentPayload,
  type BookingRecord,
  type BookingUpsertPayload,
  type FacilityUpsertPayload,
} from "../types";

interface SelectOption {
  label: string;
  value: string | null;
}

interface PrescriptionSelectOption extends SelectOption {
  defaultTitle: string | null;
}

const props = defineProps<{
  facilityOptions: SelectOption[];
  loading: boolean;
  modelValue: boolean;
  booking?: BookingRecord | null;
  prescriptionOptions: PrescriptionSelectOption[];
  submitLabel: string;
  title: string;
}>();

const emit = defineEmits<{
  submit: [
    payload: BookingUpsertPayload,
    facilityPayload: FacilityUpsertPayload | null,
    attachedDocument: BookingAttachedDocumentPayload | null,
  ];
  "update:modelValue": [value: boolean];
}>();

const { t } = useI18n();

const formError = ref("");

const form = reactive({
  appointmentAt: "",
  bookedAt: "",
  documentFile: null as File | null,
  documentNotes: "",
  documentType:
    "general_attachment" as BookingAttachedDocumentPayload["documentType"],
  facilityId: null as string | null,
  notes: "",
  prescriptionId: null as string | null,
  title: "",
});

const facilityForm = reactive({
  address: "",
  city: "",
  facilityType: "",
  name: "",
  notes: "",
});

const createNewFacility = computed({
  get: () => form.facilityId === "__create__",
  set: (value: boolean) => {
    form.facilityId = value ? "__create__" : null;
  },
});

const isEditing = computed(() => Boolean(props.booking));

const normalizedFacilityOptions = computed(() => [
  {
    label: t("bookings.unlinkedFacility"),
    value: null,
  },
  ...props.facilityOptions,
  {
    label: t("bookings.createFacilityOption"),
    value: "__create__",
  },
]);

const documentTypeOptions = computed(() =>
  documentTypes.map((documentType) => ({
    label: t(`documents.types.${documentType}`),
    value: documentType,
  })),
);

const selectedPrescriptionDefaultTitle = computed(() => {
  if (!form.prescriptionId) {
    return null;
  }

  return (
    props.prescriptionOptions.find(
      (option) => option.value === form.prescriptionId,
    )?.defaultTitle ?? null
  );
});

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

const resetFacilityForm = () => {
  facilityForm.address = "";
  facilityForm.city = "";
  facilityForm.facilityType = "";
  facilityForm.name = "";
  facilityForm.notes = "";
};

const lastAutoTitle = ref("");

const syncForm = () => {
  form.appointmentAt = toInputDateTime(props.booking?.appointmentAt ?? null);
  form.bookedAt = toInputDateTime(props.booking?.bookedAt ?? null);
  form.documentFile = null;
  form.documentNotes = "";
  form.documentType = "general_attachment";
  form.facilityId = props.booking?.facilityId ?? null;
  form.notes = props.booking?.notes ?? "";
  form.prescriptionId = props.booking?.prescriptionId ?? null;
  form.title = props.booking?.title ?? "";
  lastAutoTitle.value = "";
  resetFacilityForm();
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
  () => props.booking,
  () => {
    if (props.modelValue) {
      syncForm();
    }
  },
);

watch(
  () => form.prescriptionId,
  () => {
    const defaultTitle = selectedPrescriptionDefaultTitle.value;

    if (!defaultTitle) {
      return;
    }

    const titleCanBeAutofilled =
      !form.title.trim() || form.title === lastAutoTitle.value;

    if (titleCanBeAutofilled) {
      form.title = defaultTitle;
      lastAutoTitle.value = defaultTitle;
    }
  },
);

const closeDialog = () => {
  emit("update:modelValue", false);
  formError.value = "";
};

const handleSubmit = async () => {
  formError.value = "";

  if (!form.title.trim()) {
    formError.value = t("bookings.validation.titleRequired");
    return;
  }

  emit(
    "submit",
    {
      appointmentAt: toIsoDateTime(form.appointmentAt),
      bookedAt: toIsoDateTime(form.bookedAt),
      facilityId: createNewFacility.value ? null : form.facilityId,
      notes: form.notes.trim() || null,
      prescriptionId: form.prescriptionId,
      title: form.title.trim(),
    },
    createNewFacility.value
      ? {
          address: facilityForm.address.trim() || null,
          city: facilityForm.city.trim() || null,
          facilityType: facilityForm.facilityType.trim() || null,
          name: facilityForm.name.trim(),
          notes: facilityForm.notes.trim() || null,
        }
      : null,
    form.documentFile instanceof File
      ? {
          documentType: form.documentType,
          file: form.documentFile,
          notes: form.documentNotes.trim() || null,
        }
      : null,
  );
};
</script>

<template>
  <q-dialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <q-card class="booking-form-dialog">
      <q-card-section class="booking-form-dialog__header">
        <div>
          <p class="booking-form-dialog__eyebrow">
            {{ isEditing ? $t("bookings.editEyebrow") : $t("bookings.createEyebrow") }}
          </p>
          <h2 class="booking-form-dialog__title">{{ title }}</h2>
        </div>
        <q-btn
          flat
          round
          dense
          icon="close"
          :aria-label="$t('bookings.closeForm')"
          @click="closeDialog"
        />
      </q-card-section>

      <q-card-section>
        <q-form
          class="booking-form-dialog__form"
          @submit.prevent="handleSubmit"
        >
          <div class="booking-form-dialog__grid">
            <q-input
              v-model="form.title"
              outlined
              autocomplete="off"
              :disable="loading"
              :label="$t('bookings.fields.title')"
              :rules="[
                (value) =>
                  Boolean(String(value).trim()) ||
                  t('bookings.validation.titleRequired'),
              ]"
            />

            <q-select
              v-model="form.prescriptionId"
              outlined
              clearable
              emit-value
              map-options
              :disable="loading"
              :label="$t('bookings.fields.prescription')"
              :options="prescriptionOptions"
            />
            <q-select
              v-model="form.facilityId"
              outlined
              clearable
              emit-value
              map-options
              :disable="loading"
              :label="$t('bookings.fields.facility')"
              :options="normalizedFacilityOptions"
            />
            <q-input
              v-model="form.bookedAt"
              outlined
              type="datetime-local"
              :disable="loading"
              :label="$t('bookings.fields.bookedAt')"
            />
            <q-input
              v-model="form.appointmentAt"
              outlined
              type="datetime-local"
              :disable="loading"
              :label="$t('bookings.fields.appointmentAt')"
            />
          </div>

          <q-card
            v-if="createNewFacility"
            flat
            class="booking-form-dialog__facility-card"
          >
            <div class="booking-form-dialog__facility-grid">
              <q-input
                v-model="facilityForm.name"
                outlined
                autocomplete="off"
                :disable="loading"
                :label="$t('bookings.facilityFields.name')"
                :rules="[
                  (value) =>
                    Boolean(String(value).trim()) ||
                    t('bookings.validation.facilityNameRequired'),
                ]"
              />
              <q-input
                v-model="facilityForm.facilityType"
                outlined
                autocomplete="off"
                :disable="loading"
                :label="$t('bookings.facilityFields.facilityType')"
              />
              <q-input
                v-model="facilityForm.city"
                outlined
                autocomplete="off"
                :disable="loading"
                :label="$t('bookings.facilityFields.city')"
              />
              <q-input
                v-model="facilityForm.address"
                outlined
                autocomplete="off"
                :disable="loading"
                :label="$t('bookings.facilityFields.address')"
              />
            </div>
            <q-input
              v-model="facilityForm.notes"
              outlined
              autogrow
              type="textarea"
              :disable="loading"
              :label="$t('bookings.facilityFields.notes')"
            />
          </q-card>

          <q-input
            v-model="form.notes"
            outlined
            autogrow
            type="textarea"
            :disable="loading"
            :label="$t('bookings.fields.notes')"
          />

          <div class="booking-form-dialog__section">
            <p class="booking-form-dialog__section-title">
              {{ $t("bookings.document.title") }}
            </p>
            <p class="booking-form-dialog__helper">
              {{ $t("bookings.document.helper") }}
            </p>
            <div class="booking-form-dialog__grid">
              <q-file
                v-model="form.documentFile"
                clearable
                outlined
                accept="application/pdf,image/jpeg,image/png,image/webp"
                :disable="loading"
                :hint="$t('documents.fields.fileHint')"
                :label="$t('bookings.document.fields.file')"
              />
              <q-select
                v-model="form.documentType"
                outlined
                emit-value
                map-options
                :disable="loading"
                :label="$t('bookings.document.fields.documentType')"
                :options="documentTypeOptions"
              />
            </div>
            <q-input
              v-model="form.documentNotes"
              outlined
              autogrow
              type="textarea"
              :disable="loading"
              :label="$t('bookings.document.fields.notes')"
            />
          </div>

          <q-banner
            v-if="formError"
            dense
            rounded
            class="booking-form-dialog__error bg-negative text-white"
          >
            {{ formError }}
          </q-banner>

          <div class="booking-form-dialog__actions">
            <q-btn
              flat
              no-caps
              :disable="loading"
              :label="$t('bookings.cancel')"
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
.booking-form-dialog {
  width: min(58rem, calc(100vw - 2rem));
  border-radius: 1.5rem;
}

.booking-form-dialog__header {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 1rem;
}

.booking-form-dialog__eyebrow {
  margin: 0 0 0.35rem;
  color: #6c8f7d;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.booking-form-dialog__title {
  margin: 0;
  color: #14323f;
  font-family: "Newsreader", serif;
  font-size: 1.7rem;
}

.booking-form-dialog__form {
  display: grid;
  gap: 1rem;
}

.booking-form-dialog__grid,
.booking-form-dialog__facility-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.booking-form-dialog__facility-card {
  display: grid;
  gap: 1rem;
  padding: 1rem;
  border-radius: 1.1rem;
  background: rgba(244, 246, 243, 0.9);
}

.booking-form-dialog__section {
  display: grid;
  gap: 0.85rem;
  padding: 1rem;
  border: 1px solid rgba(20, 50, 63, 0.08);
  border-radius: 8px;
  background: rgba(244, 246, 243, 0.78);
}

.booking-form-dialog__section-title {
  margin: 0;
  color: #14323f;
  font-size: 0.98rem;
  font-weight: 700;
}

.booking-form-dialog__helper {
  margin: 0;
  color: #32505d;
  line-height: 1.5;
}

.booking-form-dialog__actions {
  display: flex;
  justify-content: end;
  gap: 0.75rem;
}

.booking-form-dialog__error {
  margin-bottom: 0.5rem;
}

@media (max-width: 720px) {
  .booking-form-dialog__grid,
  .booking-form-dialog__facility-grid {
    grid-template-columns: 1fr;
  }

  .booking-form-dialog__actions {
    justify-content: stretch;
  }
}
</style>
