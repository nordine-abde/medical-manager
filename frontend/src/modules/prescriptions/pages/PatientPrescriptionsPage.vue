<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";

import { useDocumentsStore } from "../../documents/store";
import { filterDocumentsByRelatedEntity } from "../../documents/utils";
import PrescriptionFormDialog from "../components/PrescriptionFormDialog.vue";
import { usePrescriptionsStore } from "../store";
import type {
  PrescriptionRecord,
  PrescriptionType,
  PrescriptionUpsertPayload,
} from "../types";

const prescriptionsStore = usePrescriptionsStore();
const documentsStore = useDocumentsStore();
const route = useRoute();
const router = useRouter();
const { d, t } = useI18n();

const isLoading = ref(false);
const isPrescriptionSaving = ref(false);
const isPrescriptionFormOpen = ref(false);
const editingPrescription = ref<PrescriptionRecord | null>(null);

const patientId = computed(() => route.params.patientId as string);
const prescriptions = computed(() => prescriptionsStore.prescriptions);
const documents = computed(() => documentsStore.documents);

const prescriptionSubtypeOptionsByType = computed<
  Record<PrescriptionType, string[]>
>(() => {
  const subtypeMap: Record<PrescriptionType, Set<string>> = {
    exam: new Set<string>(),
    therapy: new Set<string>(),
    visit: new Set<string>(),
  };

  for (const prescription of prescriptions.value) {
    const subtype = prescription.subtype?.trim();

    if (!subtype) {
      continue;
    }

    subtypeMap[prescription.prescriptionType].add(subtype);
  }

  return {
    exam: [...subtypeMap.exam].sort((left, right) => left.localeCompare(right)),
    therapy: [...subtypeMap.therapy].sort((left, right) =>
      left.localeCompare(right),
    ),
    visit: [...subtypeMap.visit].sort((left, right) =>
      left.localeCompare(right),
    ),
  };
});

const loadPage = async () => {
  isLoading.value = true;

  try {
    await Promise.all([
      prescriptionsStore.loadPrescriptions(patientId.value),
      documentsStore.loadDocuments(patientId.value),
    ]);
  } finally {
    isLoading.value = false;
  }
};

watch(patientId, loadPage);

onMounted(loadPage);

const formatPrescriptionDate = (value: string | null) => {
  if (!value) {
    return t("prescriptions.emptyDate");
  }

  return d(new Date(`${value}T00:00:00`), "short");
};

const resolvePrescriptionTypeLabel = (prescription: {
  prescriptionType: string;
  subtype?: string | null;
}) => {
  const typeLabel = t(`prescriptions.types.${prescription.prescriptionType}`);
  const subtype = prescription.subtype?.trim();

  return subtype ? `${typeLabel} · ${subtype}` : typeLabel;
};

const getPrescriptionDocuments = (prescriptionId: string) =>
  filterDocumentsByRelatedEntity(
    documents.value,
    "prescription",
    prescriptionId,
  );

const openCreatePrescriptionDialog = () => {
  editingPrescription.value = null;
  isPrescriptionFormOpen.value = true;
};

const openEditPrescriptionDialog = (prescription: PrescriptionRecord) => {
  editingPrescription.value = prescription;
  isPrescriptionFormOpen.value = true;
};

const handlePrescriptionSubmit = async (payload: {
  document:
    | {
        file: File;
        notes: string | null;
      }
    | null;
  prescription: PrescriptionUpsertPayload;
}) => {
  isPrescriptionSaving.value = true;

  try {
    if (editingPrescription.value) {
      if (payload.document) {
        const result = await prescriptionsStore.updatePrescriptionWithDocument(
          editingPrescription.value.id,
          {
            document: payload.document,
            prescription: {
              expirationDate: payload.prescription.expirationDate,
              issueDate: payload.prescription.issueDate,
              notes: payload.prescription.notes,
              prescriptionType: payload.prescription.prescriptionType,
              subtype: payload.prescription.subtype,
            },
          },
        );
        documentsStore.recordDocument(result.document);
      } else {
        await prescriptionsStore.updatePrescription(editingPrescription.value.id, {
          expirationDate: payload.prescription.expirationDate,
          issueDate: payload.prescription.issueDate,
          notes: payload.prescription.notes,
          prescriptionType: payload.prescription.prescriptionType,
          subtype: payload.prescription.subtype,
        });
      }
    } else {
      if (payload.document) {
        const result = await prescriptionsStore.createPrescriptionWithDocument(
          patientId.value,
          {
            document: payload.document,
            prescription: payload.prescription,
          },
        );
        documentsStore.recordDocument(result.document);
      } else {
        await prescriptionsStore.createPrescription(patientId.value, {
          ...payload.prescription,
        });
      }
    }

    isPrescriptionFormOpen.value = false;
    editingPrescription.value = null;
  } finally {
    isPrescriptionSaving.value = false;
  }
};

const handlePrescriptionDialogModelChange = (value: boolean) => {
  isPrescriptionFormOpen.value = value;

  if (!value) {
    editingPrescription.value = null;
  }
};
</script>

<template>
  <q-page class="patient-prescriptions-page">
    <q-card
      flat
      bordered
      class="patient-prescriptions-page__hero"
    >
      <q-card-section
        v-if="isLoading"
        class="patient-prescriptions-page__loading"
      >
        <q-spinner color="primary" size="2rem" />
      </q-card-section>

      <q-card-section v-else>
        <div class="patient-prescriptions-page__header">
          <div>
            <p class="patient-prescriptions-page__eyebrow">
              {{ $t("prescriptions.eyebrow") }}
            </p>
            <h1 class="patient-prescriptions-page__title">
              {{ $t("prescriptions.title") }}
            </h1>
          </div>

          <div class="patient-prescriptions-page__actions">
            <q-btn
              flat
              no-caps
              icon="west"
              :label="$t('patients.backToList')"
              @click="router.push('/app/patients')"
            />
            <q-btn
              outline
              color="primary"
              no-caps
              icon="insights"
              :label="$t('nav.overview')"
              @click="router.push(`/app/patients/${patientId}/overview`)"
            />
            <q-btn
              color="primary"
              icon="add"
              unelevated
              no-caps
              :label="$t('prescriptions.createAction')"
              @click="openCreatePrescriptionDialog"
            />
          </div>
        </div>

        <p class="patient-prescriptions-page__description">
          {{ $t("prescriptions.description") }}
        </p>

        <div
          v-if="prescriptions.length"
          class="patient-prescriptions-page__prescription-list"
        >
          <q-card
            v-for="prescription in prescriptions"
            :key="prescription.id"
            flat
            class="patient-prescriptions-page__prescription-card"
          >
            <div class="patient-prescriptions-page__prescription-head">
              <div class="patient-prescriptions-page__prescription-main">
                <div class="patient-prescriptions-page__prescription-title-row">
                  <h3 class="patient-prescriptions-page__prescription-title">
                    {{ resolvePrescriptionTypeLabel(prescription) }}
                  </h3>
                </div>
                <p class="patient-prescriptions-page__prescription-copy">
                  {{ prescription.notes || $t("prescriptions.emptyNotes") }}
                </p>
                <div class="patient-prescriptions-page__prescription-meta-grid">
                  <p class="patient-prescriptions-page__prescription-meta">
                    <span>{{ $t("prescriptions.fields.issueDate") }}</span>
                    {{ formatPrescriptionDate(prescription.issueDate) }}
                  </p>
                  <p class="patient-prescriptions-page__prescription-meta">
                    <span>{{ $t("prescriptions.fields.expirationDate") }}</span>
                    {{ formatPrescriptionDate(prescription.expirationDate) }}
                  </p>
                </div>

                <RelatedDocumentsPanel
                  :documents="getPrescriptionDocuments(prescription.id)"
                  :empty-description="$t('prescriptions.linkedDocumentsEmptyDescription')"
                  :empty-title="$t('prescriptions.linkedDocumentsEmptyTitle')"
                  :eyebrow="$t('prescriptions.linkedDocumentsEyebrow')"
                  :title="$t('prescriptions.linkedDocumentsTitle')"
                />
              </div>

              <div class="patient-prescriptions-page__prescription-actions">
                <q-btn
                  :key="`edit-${prescription.id}`"
                  flat
                  color="primary"
                  icon="edit"
                  no-caps
                  :label="$t('prescriptions.edit')"
                  @click="openEditPrescriptionDialog(prescription)"
                />
              </div>
            </div>
          </q-card>
        </div>

        <q-card
          v-else
          flat
          class="patient-prescriptions-page__prescription-empty"
        >
          <p class="patient-prescriptions-page__summary-eyebrow">
            {{ $t("prescriptions.emptyEyebrow") }}
          </p>
          <h3 class="patient-prescriptions-page__prescription-empty-title">
            {{ $t("prescriptions.emptyTitle") }}
          </h3>
          <p class="patient-prescriptions-page__summary-copy">
            {{ $t("prescriptions.emptyDescription") }}
          </p>
        </q-card>
      </q-card-section>
    </q-card>

    <PrescriptionFormDialog
      :loading="isPrescriptionSaving"
      :model-value="isPrescriptionFormOpen"
      :prescription="editingPrescription"
      :submit-label="$t('prescriptions.save')"
      :subtype-options-by-type="prescriptionSubtypeOptionsByType"
      :title="
        editingPrescription
          ? $t('prescriptions.editTitle')
          : $t('prescriptions.createTitle')
      "
      @submit="handlePrescriptionSubmit"
      @update:model-value="handlePrescriptionDialogModelChange"
    />
  </q-page>
</template>

<style scoped>
.patient-prescriptions-page {
  display: grid;
  gap: 1rem;
}

.patient-prescriptions-page__hero {
  border-radius: 1.5rem;
  background:
    linear-gradient(135deg, rgba(20, 50, 63, 0.04), transparent 40%),
    rgba(255, 255, 255, 0.94);
}

.patient-prescriptions-page__loading {
  display: flex;
  justify-content: center;
  padding: 3rem;
}

.patient-prescriptions-page__header {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 1rem;
}

.patient-prescriptions-page__eyebrow,
.patient-prescriptions-page__summary-eyebrow {
  margin: 0 0 0.4rem;
  color: #6c8f7d;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.patient-prescriptions-page__title {
  margin: 0;
  color: #14323f;
  font-family: "Newsreader", serif;
  font-size: clamp(2rem, 4vw, 3rem);
}

.patient-prescriptions-page__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  justify-content: end;
}

.patient-prescriptions-page__description {
  margin: 1rem 0 1.5rem;
  color: #32505d;
  line-height: 1.6;
}

.patient-prescriptions-page__prescription-list {
  display: grid;
  gap: 0.9rem;
}

.patient-prescriptions-page__prescription-card {
  padding: 1rem 1.1rem;
  border: 1px solid rgba(20, 50, 63, 0.06);
  border-radius: 1.25rem;
  background: rgba(244, 246, 243, 0.9);
}

.patient-prescriptions-page__prescription-head {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 1rem;
}

.patient-prescriptions-page__prescription-main {
  display: grid;
  gap: 0.65rem;
}

.patient-prescriptions-page__prescription-title-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}

.patient-prescriptions-page__prescription-title {
  margin: 0;
  color: #14323f;
  font-weight: 700;
  font-size: 1.1rem;
}

.patient-prescriptions-page__prescription-copy,
.patient-prescriptions-page__prescription-meta {
  margin: 0;
  color: #32505d;
  line-height: 1.6;
}

.patient-prescriptions-page__prescription-meta-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.65rem 1rem;
}

.patient-prescriptions-page__prescription-meta span {
  display: block;
  color: #6c8f7d;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.patient-prescriptions-page__prescription-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.patient-prescriptions-page__prescription-empty {
  padding: 1.5rem 1.1rem;
  text-align: center;
  border-radius: 1.25rem;
  background: rgba(244, 246, 243, 0.9);
}

.patient-prescriptions-page__prescription-empty-title {
  margin: 0.5rem 0;
  color: #14323f;
  font-family: "Newsreader", serif;
  font-size: 1.25rem;
}

.patient-prescriptions-page__summary-copy {
  margin: 0;
  color: #32505d;
  line-height: 1.6;
}

@media (max-width: 768px) {
  .patient-prescriptions-page__header {
    flex-direction: column;
  }

  .patient-prescriptions-page__actions {
    justify-content: start;
  }

  .patient-prescriptions-page__prescription-meta-grid {
    grid-template-columns: 1fr;
  }
}
</style>
