<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";

import RelatedDocumentsPanel from "../../documents/components/RelatedDocumentsPanel.vue";
import { useDocumentsStore } from "../../documents/store";
import { filterDocumentsByRelatedEntity } from "../../documents/utils";
import InstructionFormDialog from "../components/InstructionFormDialog.vue";
import { useInstructionsStore } from "../store";
import type {
  InstructionRecord,
  InstructionUpsertPayload,
} from "../types";
import { usePatientsStore } from "../../patients/store";

const route = useRoute();
const router = useRouter();
const { d, t } = useI18n();
const patientsStore = usePatientsStore();
const instructionsStore = useInstructionsStore();
const documentsStore = useDocumentsStore();

const isLoading = ref(false);
const isSaving = ref(false);
const isFormOpen = ref(false);
const errorMessage = ref("");

const patientId = computed(() => route.params.patientId as string);
const instructionId = computed(() => route.params.instructionId as string);
const patient = computed(() => patientsStore.currentPatient);
const instruction = computed(() => instructionsStore.currentInstruction);
const linkedDocuments = computed(() =>
  filterDocumentsByRelatedEntity(
    documentsStore.documents,
    "medical_instruction",
    instructionId.value,
  ),
);

const loadPage = async () => {
  isLoading.value = true;
  errorMessage.value = "";

  try {
    await Promise.all([
      patientsStore.loadPatient(patientId.value),
      instructionsStore.loadInstruction(instructionId.value),
      documentsStore.loadDocuments(patientId.value),
    ]);
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : t("instructions.genericError");
  } finally {
    isLoading.value = false;
  }
};

watch([patientId, instructionId], async () => {
  await loadPage();
});

onMounted(async () => {
  await loadPage();
});

const formatInstructionDate = (value: string) =>
  d(new Date(`${value}T00:00:00`), "short");

const clinicianLabel = computed(() => {
  if (!instruction.value) {
    return "";
  }

  return (
    instruction.value.doctorName ||
    instruction.value.specialty ||
    t("instructions.unknownClinician")
  );
});

const handleSubmit = async (payload: InstructionUpsertPayload) => {
  isSaving.value = true;
  errorMessage.value = "";

  try {
    await instructionsStore.updateInstruction(instructionId.value, payload);
    isFormOpen.value = false;
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : t("instructions.genericError");
  } finally {
    isSaving.value = false;
  }
};
</script>

<template>
  <q-page class="instruction-detail-page">
    <q-banner
      v-if="errorMessage"
      rounded
      class="instruction-detail-page__banner"
    >
      {{ errorMessage }}
    </q-banner>

    <q-card
      flat
      bordered
      class="instruction-detail-page__hero"
    >
      <q-card-section
        v-if="isLoading"
        class="instruction-detail-page__loading"
      >
        <q-spinner color="primary" size="2rem" />
      </q-card-section>

      <q-card-section v-else-if="instruction">
        <div class="instruction-detail-page__header">
          <div>
            <p class="instruction-detail-page__eyebrow">
              {{ $t("instructions.detailEyebrow") }}
            </p>
            <h1 class="instruction-detail-page__title">{{ clinicianLabel }}</h1>
            <p class="instruction-detail-page__subtitle">
              {{
                patient
                  ? $t("instructions.detailSubtitle", {
                      date: formatInstructionDate(instruction.instructionDate),
                      patientName: patient.fullName,
                    })
                  : formatInstructionDate(instruction.instructionDate)
              }}
            </p>
          </div>

          <div class="instruction-detail-page__actions">
            <q-btn
              flat
              no-caps
              icon="west"
              :label="$t('instructions.backToOverview')"
              @click="router.push(`/app/patients/${patientId}/overview`)"
            />
            <q-btn
              color="primary"
              icon="edit_note"
              unelevated
              no-caps
              :label="$t('instructions.edit')"
              @click="isFormOpen = true"
            />
          </div>
        </div>

        <div class="instruction-detail-page__meta">
          <q-card flat class="instruction-detail-page__meta-card">
            <p class="instruction-detail-page__meta-label">
              {{ $t("instructions.fields.status") }}
            </p>
            <q-badge
              rounded
              color="primary"
              text-color="white"
              :label="$t(`instructions.statuses.${instruction.status}`)"
            />
          </q-card>

          <q-card flat class="instruction-detail-page__meta-card">
            <p class="instruction-detail-page__meta-label">
              {{ $t("instructions.fields.specialty") }}
            </p>
            <p class="instruction-detail-page__meta-value">
              {{ instruction.specialty || $t("instructions.emptySpecialty") }}
            </p>
          </q-card>

          <q-card flat class="instruction-detail-page__meta-card">
            <p class="instruction-detail-page__meta-label">
              {{ $t("instructions.fields.targetTimingText") }}
            </p>
            <p class="instruction-detail-page__meta-value">
              {{
                instruction.targetTimingText ||
                $t("instructions.emptyTargetTimingText")
              }}
            </p>
          </q-card>
        </div>

        <div class="instruction-detail-page__content">
          <q-card flat class="instruction-detail-page__notes">
            <q-card-section>
              <p class="instruction-detail-page__section-eyebrow">
                {{ $t("instructions.originalNotesEyebrow") }}
              </p>
              <h2 class="instruction-detail-page__section-title">
                {{ $t("instructions.originalNotesTitle") }}
              </h2>
              <p class="instruction-detail-page__notes-body">
                {{ instruction.originalNotes }}
              </p>
            </q-card-section>
          </q-card>

          <q-card flat class="instruction-detail-page__tasks">
            <q-card-section>
              <p class="instruction-detail-page__section-eyebrow">
                {{ $t("instructions.linkedTasksEyebrow") }}
              </p>
              <h2 class="instruction-detail-page__section-title">
                {{ $t("instructions.linkedTasksTitle") }}
              </h2>
              <p class="instruction-detail-page__tasks-copy">
                {{ $t("instructions.linkedTasksDescription") }}
              </p>
            </q-card-section>
          </q-card>

          <RelatedDocumentsPanel
            :allow-upload="Boolean(instruction)"
            :description="$t('instructions.linkedDocumentsDescription')"
            :documents="linkedDocuments"
            :empty-description="$t('instructions.linkedDocumentsEmptyDescription')"
            :empty-title="$t('instructions.linkedDocumentsEmptyTitle')"
            :eyebrow="$t('instructions.linkedDocumentsEyebrow')"
            :patient-id="patientId"
            :related-entity-id="instruction?.id"
            related-entity-type="medical_instruction"
            :title="$t('instructions.linkedDocumentsTitle')"
          />
        </div>
      </q-card-section>
    </q-card>

    <InstructionFormDialog
      :instruction="instruction as InstructionRecord | null"
      :loading="isSaving"
      :model-value="isFormOpen"
      :submit-label="$t('instructions.save')"
      :title="$t('instructions.editTitle')"
      @submit="handleSubmit"
      @update:model-value="isFormOpen = $event"
    />
  </q-page>
</template>

<style scoped>
.instruction-detail-page {
  display: grid;
  gap: 1rem;
}

.instruction-detail-page__banner {
  background: rgba(183, 80, 63, 0.14);
  color: #7f2e22;
}

.instruction-detail-page__hero {
  border-radius: 1.5rem;
  background:
    linear-gradient(135deg, rgba(20, 50, 63, 0.04), transparent 40%),
    rgba(255, 255, 255, 0.94);
}

.instruction-detail-page__loading {
  display: flex;
  justify-content: center;
  padding: 3rem;
}

.instruction-detail-page__header,
.instruction-detail-page__actions,
.instruction-detail-page__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
}

.instruction-detail-page__header {
  align-items: start;
  justify-content: space-between;
}

.instruction-detail-page__eyebrow,
.instruction-detail-page__section-eyebrow,
.instruction-detail-page__meta-label {
  margin: 0 0 0.4rem;
  color: #6c8f7d;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.instruction-detail-page__title,
.instruction-detail-page__section-title {
  margin: 0;
  color: #14323f;
  font-family: "Newsreader", serif;
}

.instruction-detail-page__title {
  font-size: clamp(2rem, 4vw, 3rem);
}

.instruction-detail-page__section-title {
  font-size: 1.6rem;
}

.instruction-detail-page__subtitle,
.instruction-detail-page__meta-value,
.instruction-detail-page__tasks-copy {
  margin: 0;
  color: #355462;
}

.instruction-detail-page__meta {
  margin-top: 1.5rem;
}

.instruction-detail-page__meta-card,
.instruction-detail-page__notes,
.instruction-detail-page__tasks {
  border-radius: 1.25rem;
  background: rgba(241, 246, 244, 0.92);
}

.instruction-detail-page__meta-card {
  min-width: 13rem;
  padding: 1rem;
}

.instruction-detail-page__content {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(18rem, 0.9fr);
  gap: 1rem;
  margin-top: 1.5rem;
}

.instruction-detail-page__notes-body {
  margin: 0;
  color: #14323f;
  line-height: 1.7;
  white-space: pre-wrap;
}

@media (max-width: 900px) {
  .instruction-detail-page__content {
    grid-template-columns: 1fr;
  }
}
</style>
