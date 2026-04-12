<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";

import { useBookingsStore } from "../../bookings/store";
import type { BookingRecord } from "../../bookings/types";
import { useDocumentsStore } from "../store";
import {
  documentTypes,
  type DocumentRecord,
  type DocumentType,
  type RelatedEntityType,
} from "../types";
import { useInstructionsStore } from "../../instructions/store";
import type { InstructionRecord } from "../../instructions/types";
import { useMedicationsStore } from "../../medications/store";
import type { MedicationRecord } from "../../medications/types";
import { usePatientsStore } from "../../patients/store";
import { usePrescriptionsStore } from "../../prescriptions/store";
import type { PrescriptionRecord } from "../../prescriptions/types";

interface RelatedEntityOption {
  caption?: string;
  label: string;
  relatedEntityId: string;
  relatedEntityType: RelatedEntityType;
  value: string;
}

const route = useRoute();
const router = useRouter();
const { d, t } = useI18n();

const patientsStore = usePatientsStore();
const documentsStore = useDocumentsStore();
const instructionsStore = useInstructionsStore();
const prescriptionsStore = usePrescriptionsStore();
const bookingsStore = useBookingsStore();
const medicationsStore = useMedicationsStore();

const isLoading = ref(false);
const isSaving = ref(false);
const errorMessage = ref("");
const selectedFile = ref<File | null>(null);
const selectedDocumentType = ref<DocumentType>("general_attachment");
const selectedRelatedEntity = ref("");
const uploadNotes = ref("");

const patientId = computed(() => route.params.patientId as string);
const patient = computed(() => patientsStore.currentPatient);
const documents = computed(() => documentsStore.documents);
const instructions = computed(() => instructionsStore.instructions);
const prescriptions = computed(() => prescriptionsStore.prescriptions);
const bookings = computed(() => bookingsStore.activeBookings);
const facilities = computed(() => bookingsStore.facilities);
const medications = computed(() => medicationsStore.activeMedications);

const documentTypeOptions = computed(() =>
  documentTypes.map((documentType) => ({
    label: t(`documents.types.${documentType}`),
    value: documentType,
  })),
);

const relatedEntityOptions = computed<RelatedEntityOption[]>(() => {
  const options: RelatedEntityOption[] = [];

  if (patient.value) {
    options.push({
      caption: t("documents.relatedEntityDescriptions.patient"),
      label: patient.value.fullName,
      relatedEntityId: patient.value.id,
      relatedEntityType: "patient",
      value: `patient:${patient.value.id}`,
    });
  }

  for (const instruction of instructions.value) {
    options.push({
      caption: formatInstructionCaption(instruction),
      label: resolveInstructionLabel(instruction),
      relatedEntityId: instruction.id,
      relatedEntityType: "medical_instruction",
      value: `medical_instruction:${instruction.id}`,
    });
  }

  for (const prescription of prescriptions.value) {
    options.push({
      caption: formatPrescriptionCaption(prescription),
      label: t(`documents.relatedEntityLabels.prescription`),
      relatedEntityId: prescription.id,
      relatedEntityType: "prescription",
      value: `prescription:${prescription.id}`,
    });
  }

  for (const booking of bookings.value) {
    options.push({
      caption: formatBookingCaption(booking),
      label: t(`documents.relatedEntityLabels.booking`),
      relatedEntityId: booking.id,
      relatedEntityType: "booking",
      value: `booking:${booking.id}`,
    });
  }

  for (const medication of medications.value) {
    options.push({
      caption: medication.quantity,
      label: medication.name,
      relatedEntityId: medication.id,
      relatedEntityType: "medication",
      value: `medication:${medication.id}`,
    });
  }

  return options;
});

const canUpload = computed(
  () =>
    selectedFile.value instanceof File &&
    selectedDocumentType.value.length > 0 &&
    selectedRelatedEntity.value.length > 0,
);

const loadPage = async () => {
  isLoading.value = true;
  errorMessage.value = "";

  try {
    await Promise.all([
      patientsStore.loadPatient(patientId.value),
      documentsStore.loadDocuments(patientId.value),
      instructionsStore.loadInstructions(patientId.value),
      prescriptionsStore.loadPrescriptions(patientId.value),
      bookingsStore.loadBookings(patientId.value),
      bookingsStore.loadFacilities(),
      medicationsStore.loadMedications(patientId.value),
    ]);
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : t("documents.genericError");
  } finally {
    isLoading.value = false;
  }
};

watch(
  patientId,
  async () => {
    await loadPage();
  },
  { immediate: true },
);

watch(
  relatedEntityOptions,
  (options) => {
    if (options.some((option) => option.value === selectedRelatedEntity.value)) {
      return;
    }

    selectedRelatedEntity.value = options[0]?.value ?? "";
  },
  { immediate: true },
);

const resolveSelectedRelatedEntity = (): RelatedEntityOption | null =>
  relatedEntityOptions.value.find(
    (option) => option.value === selectedRelatedEntity.value,
  ) ?? null;

const resetUploadForm = () => {
  selectedFile.value = null;
  selectedDocumentType.value = "general_attachment";
  selectedRelatedEntity.value = relatedEntityOptions.value[0]?.value ?? "";
  uploadNotes.value = "";
};

const handleUpload = async () => {
  if (!(selectedFile.value instanceof File)) {
    errorMessage.value = t("documents.validation.fileRequired");
    return;
  }

  const relatedEntity = resolveSelectedRelatedEntity();

  if (!relatedEntity) {
    errorMessage.value = t("documents.validation.relatedEntityRequired");
    return;
  }

  isSaving.value = true;
  errorMessage.value = "";

  try {
    await documentsStore.uploadDocument(patientId.value, {
      documentType: selectedDocumentType.value,
      file: selectedFile.value,
      notes: uploadNotes.value.trim() || null,
      relatedEntityId: relatedEntity.relatedEntityId,
      relatedEntityType: relatedEntity.relatedEntityType,
    });
    resetUploadForm();
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : t("documents.genericError");
  } finally {
    isSaving.value = false;
  }
};

function resolveInstructionLabel(instruction: InstructionRecord): string {
  return (
    instruction.doctorName ||
    instruction.specialty ||
    t("documents.fallbacks.medicalInstruction")
  );
}

function formatInstructionCaption(instruction: InstructionRecord): string {
  return d(new Date(`${instruction.instructionDate}T00:00:00`), "short");
}

function formatPrescriptionCaption(prescription: PrescriptionRecord): string {
  if (prescription.issueDate) {
    return d(new Date(`${prescription.issueDate}T00:00:00`), "short");
  }

  return t("documents.fallbacks.noDate");
}

function resolveFacilityName(facilityId: string | null): string | null {
  return facilities.value.find((facility) => facility.id === facilityId)?.name ?? null;
}

function formatBookingCaption(booking: BookingRecord): string {
  const facilityName = resolveFacilityName(booking.facilityId);

  if (booking.appointmentAt) {
    const appointmentLabel = d(new Date(booking.appointmentAt), "short");

    return facilityName
      ? `${appointmentLabel} · ${facilityName}`
      : appointmentLabel;
  }

  return facilityName ?? t("documents.fallbacks.noDate");
}

const resolveLinkedEntityLabel = (document: DocumentRecord): string => {
  if (document.relatedEntityType === "patient") {
    return patient.value?.fullName ?? t("documents.fallbacks.patient");
  }

  if (document.relatedEntityType === "medical_instruction") {
    const instruction = instructions.value.find(
      (item) => item.id === document.relatedEntityId,
    );

    return instruction
      ? resolveInstructionLabel(instruction)
      : t("documents.fallbacks.medicalInstruction");
  }

  if (document.relatedEntityType === "prescription") {
    return t("documents.relatedEntityLabels.prescription");
  }

  if (document.relatedEntityType === "booking") {
    return t("documents.relatedEntityLabels.booking");
  }

  if (document.relatedEntityType === "medication") {
    const medication = medications.value.find(
      (item) => item.id === document.relatedEntityId,
    );

    return medication?.name ?? t("documents.fallbacks.medication");
  }

  return t("documents.fallbacks.relatedEntity");
};

const resolveLinkedEntityCaption = (document: DocumentRecord): string => {
  if (document.relatedEntityType === "patient") {
    return t("documents.relatedEntityDescriptions.patient");
  }

  if (document.relatedEntityType === "medical_instruction") {
    const instruction = instructions.value.find(
      (item) => item.id === document.relatedEntityId,
    );

    return instruction
      ? formatInstructionCaption(instruction)
      : t("documents.fallbacks.noDate");
  }

  if (document.relatedEntityType === "prescription") {
    const prescription = prescriptions.value.find(
      (item) => item.id === document.relatedEntityId,
    );

    return prescription
      ? formatPrescriptionCaption(prescription)
      : t("documents.fallbacks.noDate");
  }

  if (document.relatedEntityType === "booking") {
    const booking = bookings.value.find(
      (item) => item.id === document.relatedEntityId,
    );

    return booking ? formatBookingCaption(booking) : t("documents.fallbacks.noDate");
  }

  if (document.relatedEntityType === "medication") {
    const medication = medications.value.find(
      (item) => item.id === document.relatedEntityId,
    );

    return medication?.quantity ?? t("documents.fallbacks.relatedEntity");
  }

  return t("documents.fallbacks.relatedEntity");
};

const formatUploadedAt = (value: string): string => d(new Date(value), "short");

const formatFileSize = (value: number): string => {
  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};
</script>

<template>
  <q-page class="patient-documents-page">
    <q-banner
      v-if="errorMessage"
      rounded
      class="patient-documents-page__banner"
    >
      {{ errorMessage }}
    </q-banner>

    <q-card
      flat
      bordered
      class="patient-documents-page__hero"
    >
      <q-card-section
        v-if="isLoading"
        class="patient-documents-page__loading"
      >
        <q-spinner color="primary" size="2rem" />
      </q-card-section>

      <q-card-section v-else-if="patient">
        <div class="patient-documents-page__header">
          <div>
            <p class="patient-documents-page__eyebrow">
              {{ $t("documents.eyebrow") }}
            </p>
            <h1 class="patient-documents-page__title">
              {{ $t("documents.title") }}
            </h1>
            <p class="patient-documents-page__subtitle">
              {{
                $t("documents.subtitle", {
                  patientName: patient.fullName,
                })
              }}
            </p>
          </div>

          <div class="patient-documents-page__actions">
            <q-btn
              flat
              no-caps
              icon="west"
              :label="$t('documents.backToOverview')"
              @click="router.push(`/app/patients/${patientId}/overview`)"
            />
          </div>
        </div>

        <div class="patient-documents-page__content">
          <q-card flat class="patient-documents-page__upload-card">
            <q-card-section class="patient-documents-page__section-header">
              <div>
                <p class="patient-documents-page__section-eyebrow">
                  {{ $t("documents.uploadEyebrow") }}
                </p>
                <h2 class="patient-documents-page__section-title">
                  {{ $t("documents.uploadTitle") }}
                </h2>
                <p class="patient-documents-page__section-copy">
                  {{ $t("documents.uploadDescription") }}
                </p>
              </div>
            </q-card-section>

            <q-card-section class="patient-documents-page__upload-grid">
              <q-file
                v-model="selectedFile"
                clearable
                outlined
                dense
                accept="application/pdf,image/jpeg,image/png,image/webp"
                :label="$t('documents.fields.file')"
                :hint="$t('documents.fields.fileHint')"
              />

              <q-select
                v-model="selectedDocumentType"
                outlined
                dense
                emit-value
                map-options
                :label="$t('documents.fields.documentType')"
                :options="documentTypeOptions"
              />

              <q-select
                v-model="selectedRelatedEntity"
                outlined
                dense
                emit-value
                map-options
                option-label="label"
                option-value="value"
                :label="$t('documents.fields.relatedEntity')"
                :options="relatedEntityOptions"
              >
                <template #option="scope">
                  <q-item v-bind="scope.itemProps">
                    <q-item-section>
                      <q-item-label>{{ scope.opt.label }}</q-item-label>
                      <q-item-label caption>{{ scope.opt.caption }}</q-item-label>
                    </q-item-section>
                  </q-item>
                </template>
              </q-select>

              <q-input
                v-model="uploadNotes"
                outlined
                dense
                autogrow
                type="textarea"
                :label="$t('documents.fields.notes')"
              />
            </q-card-section>

            <q-card-actions align="right">
              <q-btn
                color="primary"
                unelevated
                no-caps
                icon="upload_file"
                :disable="!canUpload"
                :loading="isSaving"
                :label="$t('documents.uploadAction')"
                @click="handleUpload"
              />
            </q-card-actions>
          </q-card>

          <q-card flat class="patient-documents-page__list-card">
            <q-card-section class="patient-documents-page__section-header">
              <div>
                <p class="patient-documents-page__section-eyebrow">
                  {{ $t("documents.listEyebrow") }}
                </p>
                <h2 class="patient-documents-page__section-title">
                  {{ $t("documents.listTitle") }}
                </h2>
                <p class="patient-documents-page__section-copy">
                  {{ $t("documents.description") }}
                </p>
              </div>
            </q-card-section>

            <q-card-section v-if="documents.length">
              <div class="patient-documents-page__list">
                <q-card
                  v-for="document in documents"
                  :key="document.id"
                  flat
                  class="patient-documents-page__document-card"
                >
                  <div class="patient-documents-page__document-head">
                    <div class="patient-documents-page__document-main">
                      <div class="patient-documents-page__document-title-row">
                        <h3 class="patient-documents-page__document-title">
                          {{ document.originalFilename }}
                        </h3>
                        <q-badge
                          rounded
                          color="primary"
                          text-color="white"
                          :label="$t(`documents.types.${document.documentType}`)"
                        />
                      </div>

                      <p class="patient-documents-page__document-meta">
                        {{ $t("documents.uploadedAt") }}
                        {{ formatUploadedAt(document.uploadedAt) }}
                        · {{ formatFileSize(document.fileSizeBytes) }}
                      </p>

                      <div class="patient-documents-page__document-link">
                        <p class="patient-documents-page__document-link-label">
                          {{ $t("documents.linkedTo") }}
                        </p>
                        <p class="patient-documents-page__document-link-value">
                          {{ resolveLinkedEntityLabel(document) }}
                        </p>
                        <p class="patient-documents-page__document-link-caption">
                          {{
                            $t(
                              `documents.relatedEntityLabels.${document.relatedEntityType}`,
                            )
                          }}
                          · {{ resolveLinkedEntityCaption(document) }}
                        </p>
                      </div>

                      <p
                        v-if="document.notes"
                        class="patient-documents-page__document-notes"
                      >
                        {{ document.notes }}
                      </p>
                    </div>

                    <div class="patient-documents-page__document-actions">
                      <q-btn
                        color="primary"
                        flat
                        no-caps
                        icon="download"
                        :href="document.downloadUrl"
                        :label="$t('documents.downloadAction')"
                        target="_blank"
                      />
                    </div>
                  </div>
                </q-card>
              </div>
            </q-card-section>

            <q-card-section v-else>
              <q-card flat class="patient-documents-page__empty">
                <p class="patient-documents-page__section-eyebrow">
                  {{ $t("documents.emptyEyebrow") }}
                </p>
                <h3 class="patient-documents-page__empty-title">
                  {{ $t("documents.emptyTitle") }}
                </h3>
                <p class="patient-documents-page__section-copy">
                  {{ $t("documents.emptyDescription") }}
                </p>
              </q-card>
            </q-card-section>
          </q-card>
        </div>
      </q-card-section>
    </q-card>
  </q-page>
</template>

<style scoped>
.patient-documents-page {
  display: grid;
  gap: 1rem;
}

.patient-documents-page__banner {
  background: rgba(183, 80, 63, 0.14);
  color: #7f2e22;
}

.patient-documents-page__hero {
  border-radius: 1.5rem;
  background:
    linear-gradient(135deg, rgba(20, 50, 63, 0.04), transparent 40%),
    rgba(255, 255, 255, 0.94);
}

.patient-documents-page__loading {
  display: flex;
  justify-content: center;
  padding: 3rem;
}

.patient-documents-page__header,
.patient-documents-page__actions,
.patient-documents-page__content,
.patient-documents-page__document-head {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
}

.patient-documents-page__header {
  align-items: start;
  justify-content: space-between;
}

.patient-documents-page__eyebrow,
.patient-documents-page__section-eyebrow {
  margin: 0 0 0.35rem;
  color: #8d5d33;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.patient-documents-page__title,
.patient-documents-page__section-title,
.patient-documents-page__empty-title,
.patient-documents-page__document-title {
  margin: 0;
  color: #14323f;
}

.patient-documents-page__subtitle,
.patient-documents-page__section-copy,
.patient-documents-page__document-meta,
.patient-documents-page__document-link-caption,
.patient-documents-page__document-notes {
  margin: 0.35rem 0 0;
  color: #51636f;
  line-height: 1.5;
}

.patient-documents-page__content {
  display: grid;
  grid-template-columns: minmax(18rem, 24rem) minmax(0, 1fr);
  align-items: start;
}

.patient-documents-page__upload-card,
.patient-documents-page__list-card,
.patient-documents-page__document-card,
.patient-documents-page__empty {
  border-radius: 1.25rem;
  background: rgba(255, 255, 255, 0.92);
}

.patient-documents-page__upload-grid {
  display: grid;
  gap: 0.9rem;
}

.patient-documents-page__list {
  display: grid;
  gap: 0.9rem;
}

.patient-documents-page__document-head {
  align-items: start;
  justify-content: space-between;
  padding: 1rem;
}

.patient-documents-page__document-main {
  min-width: 0;
  flex: 1 1 18rem;
}

.patient-documents-page__document-title-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
}

.patient-documents-page__document-link {
  margin-top: 0.85rem;
}

.patient-documents-page__document-link-label,
.patient-documents-page__document-link-value {
  margin: 0;
  color: #14323f;
}

.patient-documents-page__document-link-label {
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.patient-documents-page__document-link-value {
  margin-top: 0.2rem;
  font-weight: 700;
}

.patient-documents-page__document-actions {
  display: flex;
  align-items: start;
}

@media (max-width: 960px) {
  .patient-documents-page__content {
    grid-template-columns: 1fr;
  }
}
</style>
