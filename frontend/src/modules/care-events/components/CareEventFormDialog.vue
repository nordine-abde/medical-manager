<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

import type { FacilityUpsertPayload } from "../../bookings/types";
import {
  documentTypes,
  type DocumentType,
} from "../../documents/types";
import {
  careEventTypes,
  type CareEventRecord,
  type CareEventType,
  type CareEventUpsertPayload,
} from "../types";

interface SelectOption {
  label: string;
  value: string | null;
}

interface CareEventFormSubmitPayload {
  attachedDocument:
    | {
        documentType: DocumentType;
        file: File;
        notes: string | null;
      }
    | null;
  careEvent: CareEventUpsertPayload;
  facilityPayload: FacilityUpsertPayload | null;
}

const props = defineProps<{
  bookingOptions: SelectOption[];
  careEvent?: CareEventRecord | null;
  facilityOptions: SelectOption[];
  loading: boolean;
  modelValue: boolean;
  submitLabel: string;
  subtypeOptionsByType: Record<CareEventType, string[]>;
  title: string;
}>();

const emit = defineEmits<{
  submit: [payload: CareEventFormSubmitPayload];
  "update:modelValue": [value: boolean];
}>();

const { t } = useI18n();

const subtypeFilterText = ref("");

const form = reactive({
  bookingId: null as string | null,
  completedAt: "",
  documentFile: null as File | null,
  documentNotes: "",
  documentType: "general_attachment" as DocumentType,
  eventType: "exam" as CareEventType,
  facilityId: null as string | null,
  outcomeNotes: "",
  providerName: "",
  subtype: "",
  subtypeInput: "",
});

const facilityForm = reactive({
  address: "",
  city: "",
  facilityType: "",
  name: "",
  notes: "",
});

const isEditing = computed(() => Boolean(props.careEvent));
const createNewFacility = computed({
  get: () => form.facilityId === "__create__",
  set: (value: boolean) => {
    form.facilityId = value ? "__create__" : null;
  },
});

const eventTypeOptions = computed(() =>
  careEventTypes.map((eventType) => ({
    label: t(`careEvents.types.${eventType}`),
    value: eventType,
  })),
);

const subtypeOptions = computed(() => {
  const options = props.subtypeOptionsByType[form.eventType] ?? [];
  const filterText = subtypeFilterText.value;

  if (!filterText) {
    return options;
  }

  return options.filter((option) => option.toLowerCase().includes(filterText));
});

const normalizedTaskOptions = computed(() => [
  {
    label: t("careEvents.unlinkedTask"),
    value: null,
  },
]);

const normalizedBookingOptions = computed(() => [
  {
    label: t("careEvents.unlinkedBooking"),
    value: null,
  },
  ...props.bookingOptions,
]);

const normalizedFacilityOptions = computed(() => [
  {
    label: t("careEvents.unlinkedFacility"),
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

const toInputDateTime = (value: string | null): string => {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60_000);
  return localDate.toISOString().slice(0, 16);
};

const toIsoDateTime = (value: string): string =>
  new Date(value).toISOString();

const normalizeText = (value: string | null | undefined): string =>
  value?.trim() ?? "";

const normalizeSubtypeValue = (value: string | null | undefined): string =>
  value?.trim() ?? "";

const buildDefaultDocumentType = (eventType: CareEventType): DocumentType => {
  if (eventType === "exam") {
    return "exam_result";
  }

  if (eventType === "specialist_visit") {
    return "visit_report";
  }

  return "general_attachment";
};

const resetFacilityForm = () => {
  facilityForm.address = "";
  facilityForm.city = "";
  facilityForm.facilityType = "";
  facilityForm.name = "";
  facilityForm.notes = "";
};

const syncForm = () => {
  form.bookingId = props.careEvent?.bookingId ?? null;
  form.completedAt = toInputDateTime(props.careEvent?.completedAt ?? null);
  form.documentFile = null;
  form.documentNotes = "";
  form.documentType = buildDefaultDocumentType(props.careEvent?.eventType ?? "exam");
  form.eventType = props.careEvent?.eventType ?? "exam";
  form.facilityId = props.careEvent?.facilityId ?? null;
  form.outcomeNotes = props.careEvent?.outcomeNotes ?? "";
  form.providerName = props.careEvent?.providerName ?? "";
  form.subtype = normalizeSubtypeValue(props.careEvent?.subtype);
  form.subtypeInput = form.subtype;
  subtypeFilterText.value = "";
  resetFacilityForm();
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
  () => props.careEvent,
  () => {
    if (props.modelValue) {
      syncForm();
    }
  },
);

watch(
  () => form.eventType,
  (eventType) => {
    if (!form.documentFile) {
      form.documentType = buildDefaultDocumentType(eventType);
    }

    form.subtype = "";
    form.subtypeInput = "";
    subtypeFilterText.value = "";
  },
  {
    flush: "sync",
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

const handleSubtypeModelValue = (value: string | number | null) => {
  const subtype = normalizeSubtypeValue(String(value ?? ""));

  form.subtype = subtype;
  form.subtypeInput = subtype;
};

const handleSubtypeFilter = (
  value: string,
  update: (callback: () => void) => void,
) => {
  update(() => {
    const filterText = normalizeSubtypeValue(value).toLowerCase();
    const currentSubtype = normalizeSubtypeValue(form.subtype).toLowerCase();

    subtypeFilterText.value =
      filterText && filterText !== currentSubtype ? filterText : "";
  });
};

const handleSubtypeNewValue = (
  value: string,
  done: (value?: string, mode?: "add" | "add-unique" | "toggle") => void,
) => {
  const subtype = normalizeSubtypeValue(value);

  form.subtype = subtype;
  form.subtypeInput = subtype;
  subtypeFilterText.value = "";
  done(subtype, "add-unique");
};

const resolveFacilitySelection = (): {
  facilityId: string | null;
  facilityPayload: FacilityUpsertPayload | null;
} => {
  if (!createNewFacility.value) {
    return {
      facilityId: form.facilityId,
      facilityPayload: null,
    };
  }

  const facilityName = normalizeText(facilityForm.name);

  if (!facilityName) {
    return {
      facilityId: null,
      facilityPayload: null,
    };
  }

  return {
    facilityId: null,
    facilityPayload: {
      address: normalizeText(facilityForm.address) || null,
      city: normalizeText(facilityForm.city) || null,
      facilityType: normalizeText(facilityForm.facilityType) || null,
      name: facilityName,
      notes: normalizeText(facilityForm.notes) || null,
    },
  };
};

const formError = ref("");

const handleSubmit = async () => {
  formError.value = "";

  if (!form.completedAt.trim()) {
    formError.value = t("careEvents.validation.completedAtRequired");
    return;
  }

  commitSubtypeInput();

  const { facilityId, facilityPayload } = resolveFacilitySelection();

  emit("submit", {
    attachedDocument:
      form.documentFile instanceof File
        ? {
            documentType: form.documentType,
            file: form.documentFile,
            notes: form.documentNotes.trim() || null,
          }
        : null,
    careEvent: {
      bookingId: form.bookingId,
      completedAt: toIsoDateTime(form.completedAt),
      eventType: form.eventType,
      facilityId,
      outcomeNotes: form.outcomeNotes.trim() || null,
      providerName: form.providerName.trim() || null,
      subtype: normalizeSubtypeValue(form.subtype) || null,
    },
    facilityPayload,
  });
};
</script>

<template>
  <q-dialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <q-card class="care-event-form-dialog">
      <q-card-section class="care-event-form-dialog__header">
        <div>
          <p class="care-event-form-dialog__eyebrow">
            {{
              isEditing
                ? $t("careEvents.editEyebrow")
                : $t("careEvents.createEyebrow")
            }}
          </p>
          <h2 class="care-event-form-dialog__title">{{ title }}</h2>
        </div>
        <q-btn
          flat
          round
          dense
          icon="close"
          :aria-label="$t('careEvents.closeForm')"
          @click="closeDialog"
        />
      </q-card-section>

      <q-card-section>
        <q-form
          class="care-event-form-dialog__form"
          @submit.prevent="handleSubmit"
        >
          <div class="care-event-form-dialog__grid">
            <q-select
              v-model="form.eventType"
              outlined
              emit-value
              map-options
              :disable="loading"
              :label="$t('careEvents.fields.eventType')"
              :options="eventTypeOptions"
            />
            <q-input
              v-model="form.completedAt"
              outlined
              type="datetime-local"
              :disable="loading"
              :label="$t('careEvents.fields.completedAt')"
              :rules="[
                (value) =>
                  Boolean(String(value ?? '').trim()) ||
                  t('careEvents.validation.completedAtRequired'),
              ]"
            />
            <q-input
              v-model="form.providerName"
              outlined
              :disable="loading"
              :label="$t('careEvents.fields.providerName')"
            />
            <q-select
              :model-value="form.subtype"
              :input-value="form.subtypeInput"
              outlined
              use-input
              hide-selected
              fill-input
              clearable
              new-value-mode="add-unique"
              :disable="loading"
              :hint="$t('careEvents.subtypeHint')"
              :label="$t('careEvents.fields.subtype')"
              :options="subtypeOptions"
              @blur="commitSubtypeInput"
              @clear="handleSubtypeInputValue(null)"
              @filter="handleSubtypeFilter"
              @input-value="handleSubtypeInputValue"
              @new-value="handleSubtypeNewValue"
              @update:model-value="handleSubtypeModelValue"
            />
            <q-select
              v-model="form.facilityId"
              outlined
              clearable
              emit-value
              map-options
              :disable="loading"
              :label="$t('careEvents.fields.facility')"
              :options="normalizedFacilityOptions"
            />

            <q-select
              v-model="form.bookingId"
              outlined
              emit-value
              map-options
              :disable="loading"
              :label="$t('careEvents.fields.booking')"
              :options="normalizedBookingOptions"
            />
          </div>

          <q-card
            v-if="createNewFacility"
            flat
            class="care-event-form-dialog__facility-card"
          >
            <div class="care-event-form-dialog__facility-grid">
              <q-input
                v-model="facilityForm.name"
                outlined
                autocomplete="off"
                :disable="loading"
                :label="$t('bookings.facilityFields.name')"
                :rules="[
                  (value) =>
                    Boolean(String(value ?? '').trim()) ||
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

          <div class="care-event-form-dialog__section">
            <p class="care-event-form-dialog__section-title">
              {{ $t("careEvents.resultDocument.title") }}
            </p>
            <p class="care-event-form-dialog__helper">
              {{ $t("careEvents.resultDocument.helper") }}
            </p>
            <div class="care-event-form-dialog__grid">
              <q-file
                v-model="form.documentFile"
                clearable
                outlined
                accept="application/pdf,image/jpeg,image/png,image/webp"
                :disable="loading"
                :label="$t('careEvents.resultDocument.fields.file')"
              />
              <q-select
                v-model="form.documentType"
                outlined
                emit-value
                map-options
                :disable="loading"
                :label="$t('careEvents.resultDocument.fields.documentType')"
                :options="documentTypeOptions"
              />
            </div>
            <q-input
              v-model="form.documentNotes"
              outlined
              autogrow
              type="textarea"
              :disable="loading"
              :label="$t('careEvents.resultDocument.fields.notes')"
            />
          </div>

          <q-input
            v-model="form.outcomeNotes"
            outlined
            autogrow
            type="textarea"
            :disable="loading"
            :label="$t('careEvents.fields.outcomeNotes')"
          />

          <q-banner
            v-if="formError"
            dense
            rounded
            class="care-event-form-dialog__error bg-negative text-white"
          >
            {{ formError }}
          </q-banner>

          <div class="care-event-form-dialog__actions">
            <q-btn
              flat
              no-caps
              color="grey-7"
              :label="$t('careEvents.cancel')"
              @click="closeDialog"
            />
            <q-btn
              color="primary"
              unelevated
              no-caps
              type="submit"
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
.care-event-form-dialog {
  width: min(44rem, 92vw);
  border-radius: 1.5rem;
}

.care-event-form-dialog__header,
.care-event-form-dialog__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.care-event-form-dialog__eyebrow {
  margin: 0 0 0.35rem;
  color: #9a5c2b;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.care-event-form-dialog__title {
  margin: 0;
  color: #16313f;
  font-size: 1.45rem;
  font-weight: 700;
}

.care-event-form-dialog__form {
  display: grid;
  gap: 1rem;
}

.care-event-form-dialog__grid,
.care-event-form-dialog__facility-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.care-event-form-dialog__facility-card {
  display: grid;
  gap: 1rem;
  padding: 1rem;
  border-radius: 1.1rem;
  background: rgba(244, 246, 243, 0.9);
}

.care-event-form-dialog__section {
  display: grid;
  gap: 1rem;
}

.care-event-form-dialog__section {
  padding: 1rem;
  border: 1px solid rgba(20, 50, 63, 0.08);
  border-radius: 1rem;
  background: #fcfaf6;
}

.care-event-form-dialog__section-title {
  margin: 0;
  color: #16313f;
  font-size: 0.98rem;
  font-weight: 700;
}

.care-event-form-dialog__helper {
  margin: -0.35rem 0 0;
  color: #5b6c77;
  font-size: 0.92rem;
}

.care-event-form-dialog__error {
  margin-bottom: 0.5rem;
}

.care-event-form-dialog__actions {
  justify-content: flex-end;
}

@media (max-width: 720px) {
  .care-event-form-dialog__grid,
  .care-event-form-dialog__facility-grid {
    grid-template-columns: 1fr;
  }

  .care-event-form-dialog__actions {
    flex-direction: column-reverse;
    align-items: stretch;
  }
}
</style>
