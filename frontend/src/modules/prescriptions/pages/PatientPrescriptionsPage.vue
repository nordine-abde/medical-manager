<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";

import { useDocumentsStore } from "../../documents/store";
import type { DocumentRecord } from "../../documents/types";
import { filterDocumentsByRelatedEntity } from "../../documents/utils";
import { usePatientsStore } from "../../patients/store";
import PrescriptionFormDialog from "../components/PrescriptionFormDialog.vue";
import { usePrescriptionsStore } from "../store";
import type {
  PrescriptionListFilters,
  PrescriptionRecord,
  PrescriptionType,
  PrescriptionUpsertPayload,
} from "../types";
import { prescriptionTypes } from "../types";

const prescriptionsStore = usePrescriptionsStore();
const documentsStore = useDocumentsStore();
const patientsStore = usePatientsStore();
const route = useRoute();
const router = useRouter();
const { d, t } = useI18n();

const isLoading = ref(false);
const isPrescriptionSaving = ref(false);
const isPrescriptionDeleting = ref(false);
const isPrescriptionFormOpen = ref(false);
const editingPrescription = ref<PrescriptionRecord | null>(null);
const errorMessage = ref("");
const dateFilterError = ref("");
const filters = reactive({
  from: "",
  includeArchived: false,
  page: 1,
  pageSize: 20,
  prescriptionType: null as PrescriptionType | null,
  search: "" as string | null,
  subtype: "" as string | null,
  to: "",
});

const patientId = computed(() => route.params.patientId as string);
const patient = computed(() => patientsStore.currentPatient);
const prescriptions = computed(() => prescriptionsStore.prescriptions);
const pagination = computed(() => prescriptionsStore.pagination);
const documents = computed(() => documentsStore.documents);
const prescriptionSubtypeOptionsByType = computed(
  () => prescriptionsStore.subtypesByType,
);

const prescriptionTypeFilterOptions = computed(() => [
  {
    label: t("prescriptions.filters.allTypes"),
    value: null,
  },
  ...prescriptionTypes.map((prescriptionType) => ({
    label: t(`prescriptions.types.${prescriptionType}`),
    value: prescriptionType,
  })),
]);

const normalizeFilterText = (value: string | null): string =>
  value?.trim() ?? "";

const hasActiveFilters = computed(
  () =>
    Boolean(normalizeFilterText(filters.search)) ||
    Boolean(filters.prescriptionType) ||
    Boolean(normalizeFilterText(filters.subtype)) ||
    Boolean(filters.from) ||
    Boolean(filters.to) ||
    filters.includeArchived,
);

const buildPrescriptionFilters = (): PrescriptionListFilters => {
  const prescriptionFilters: PrescriptionListFilters = {
    includeArchived: filters.includeArchived,
    page: filters.page,
    pageSize: filters.pageSize,
  };
  const search = normalizeFilterText(filters.search);
  const subtype = normalizeFilterText(filters.subtype);

  if (filters.from) {
    prescriptionFilters.from = filters.from;
  }

  if (filters.prescriptionType) {
    prescriptionFilters.prescriptionType = filters.prescriptionType;
  }

  if (search) {
    prescriptionFilters.search = search;
  }

  if (subtype) {
    prescriptionFilters.subtype = subtype;
  }

  if (filters.to) {
    prescriptionFilters.to = filters.to;
  }

  return prescriptionFilters;
};

const loadPrescriptions = async () => {
  await prescriptionsStore.loadPrescriptions(
    patientId.value,
    buildPrescriptionFilters(),
  );
};

const loadPage = async () => {
  isLoading.value = true;
  errorMessage.value = "";

  try {
    await Promise.all([
      patientsStore.loadPatient(patientId.value),
      documentsStore.loadDocuments(patientId.value),
      prescriptionsStore.loadPrescriptionSubtypes(patientId.value),
      loadPrescriptions(),
    ]);
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : t("prescriptions.genericError");
  } finally {
    isLoading.value = false;
  }
};

const applyFilters = async () => {
  dateFilterError.value = "";

  if (filters.from && filters.to && filters.from > filters.to) {
    dateFilterError.value = t("prescriptions.filters.dateRangeError");
    return;
  }

  filters.page = 1;

  try {
    await loadPrescriptions();
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : t("prescriptions.genericError");
  }
};

const resetFilters = async () => {
  filters.from = "";
  filters.includeArchived = false;
  filters.page = 1;
  filters.prescriptionType = null;
  filters.search = "";
  filters.subtype = "";
  filters.to = "";
  dateFilterError.value = "";
  await applyFilters();
};

const handlePageChange = async (page: number) => {
  filters.page = page;

  try {
    await loadPrescriptions();
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : t("prescriptions.genericError");
  }
};

watch(patientId, async () => {
  await loadPage();
});

onMounted(async () => {
  await loadPage();
});

const formatPrescriptionDate = (value: string | null) => {
  if (!value) {
    return t("prescriptions.emptyDate");
  }

  return d(new Date(`${value}T00:00:00`), "short");
};

const resolvePrescriptionTitle = (prescription: PrescriptionRecord): string => {
  const titleParts = [t(`prescriptions.types.${prescription.prescriptionType}`)];
  const subtype = prescription.subtype?.trim();

  if (subtype) {
    titleParts.push(subtype);
  }

  return titleParts.join(" · ");
};

const resolveDocumentsList = (prescriptionId: string): DocumentRecord[] =>
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

const handleDeletePrescription = async (prescription: PrescriptionRecord) => {
  const title = resolvePrescriptionTitle(prescription);

  if (
    !window.confirm(
      t("prescriptions.deleteConfirm", {
        title,
      }),
    )
  ) {
    return;
  }

  isPrescriptionDeleting.value = true;
  errorMessage.value = "";

  try {
    await prescriptionsStore.deletePrescription(prescription.id);
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : t("prescriptions.genericError");
  } finally {
    isPrescriptionDeleting.value = false;
  }
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
  errorMessage.value = "";

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
        await prescriptionsStore.updatePrescription(
          editingPrescription.value.id,
          {
            expirationDate: payload.prescription.expirationDate,
            issueDate: payload.prescription.issueDate,
            notes: payload.prescription.notes,
            prescriptionType: payload.prescription.prescriptionType,
            subtype: payload.prescription.subtype,
          },
        );
      }
    } else if (payload.document) {
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

    isPrescriptionFormOpen.value = false;
    editingPrescription.value = null;
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : t("prescriptions.genericError");
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
    <q-banner
      v-if="errorMessage"
      dense
      rounded
      class="patient-prescriptions-page__banner bg-negative text-white"
    >
      {{ errorMessage }}
    </q-banner>

    <section class="patient-prescriptions-page__hero">
      <div v-if="isLoading" class="patient-prescriptions-page__loading">
        <q-spinner color="primary" size="2rem" />
      </div>

      <template v-else>
        <div class="patient-prescriptions-page__header">
          <div>
            <p class="patient-prescriptions-page__eyebrow">
              {{ $t("prescriptions.eyebrow") }}
            </p>
            <h1 class="patient-prescriptions-page__title">
              {{ $t("prescriptions.title") }}
            </h1>
            <p class="patient-prescriptions-page__subtitle">
              {{
                $t("prescriptions.subtitle", {
                  patientName: patient?.fullName ?? $t("patients.title"),
                })
              }}
            </p>
          </div>

          <div class="patient-prescriptions-page__actions">
            <q-btn
              flat
              no-caps
              color="primary"
              icon="arrow_back"
              :label="$t('prescriptions.backToOverview')"
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

        <div class="patient-prescriptions-page__summary">
          <q-chip square color="white" text-color="primary" icon="receipt_long">
            {{
              $t("prescriptions.summaryCount", {
                count: pagination.total,
              })
            }}
          </q-chip>
        </div>

        <q-card flat class="patient-prescriptions-page__filters">
          <div class="patient-prescriptions-page__filter-grid">
            <q-input
              v-model="filters.search"
              outlined
              dense
              clearable
              :label="$t('prescriptions.filters.searchLabel')"
              :placeholder="$t('prescriptions.filters.searchPlaceholder')"
              @keyup.enter="applyFilters"
            />
            <q-select
              v-model="filters.prescriptionType"
              outlined
              dense
              emit-value
              map-options
              :label="$t('prescriptions.filters.typeLabel')"
              :options="prescriptionTypeFilterOptions"
            />
            <q-input
              v-model="filters.subtype"
              outlined
              dense
              clearable
              :label="$t('prescriptions.filters.subtypeLabel')"
              @keyup.enter="applyFilters"
            />
            <q-input
              v-model="filters.from"
              outlined
              dense
              type="date"
              :label="$t('prescriptions.filters.startDateLabel')"
            />
            <q-input
              v-model="filters.to"
              outlined
              dense
              type="date"
              :label="$t('prescriptions.filters.endDateLabel')"
            />
            <q-toggle
              v-model="filters.includeArchived"
              color="primary"
              :label="$t('prescriptions.filters.includeArchived')"
            />
          </div>

          <q-banner
            v-if="dateFilterError"
            dense
            rounded
            class="bg-warning text-white"
          >
            {{ dateFilterError }}
          </q-banner>

          <div class="patient-prescriptions-page__filter-actions">
            <q-btn
              color="primary"
              unelevated
              no-caps
              icon="search"
              :label="$t('prescriptions.filters.apply')"
              @click="applyFilters"
            />
            <q-btn
              flat
              no-caps
              color="primary"
              icon="restart_alt"
              :disable="!hasActiveFilters"
              :label="$t('prescriptions.filters.reset')"
              @click="resetFilters"
            />
          </div>
        </q-card>

        <div
          v-if="prescriptions.length"
          class="patient-prescriptions-page__list"
        >
          <q-card
            v-for="prescription in prescriptions"
            :key="prescription.id"
            flat
            class="patient-prescriptions-page__prescription"
          >
            <div class="patient-prescriptions-page__prescription-head">
              <div class="patient-prescriptions-page__prescription-main">
                <div class="patient-prescriptions-page__prescription-title-row">
                  <h2 class="patient-prescriptions-page__prescription-title">
                    {{ resolvePrescriptionTitle(prescription) }}
                  </h2>
                  <q-badge
                    v-if="prescription.deletedAt"
                    rounded
                    color="grey-7"
                    text-color="white"
                    :label="$t('prescriptions.archivedBadge')"
                  />
                </div>

                <p class="patient-prescriptions-page__prescription-copy">
                  {{ prescription.notes || $t("prescriptions.emptyNotes") }}
                </p>

                <div class="patient-prescriptions-page__prescription-meta-grid">
                  <p class="patient-prescriptions-page__prescription-meta">
                    <span>{{ $t("prescriptions.fields.subtype") }}</span>
                    {{ prescription.subtype || $t("prescriptions.emptySubtype") }}
                  </p>
                  <p class="patient-prescriptions-page__prescription-meta">
                    <span>{{ $t("prescriptions.fields.issueDate") }}</span>
                    {{ formatPrescriptionDate(prescription.issueDate) }}
                  </p>
                  <p class="patient-prescriptions-page__prescription-meta">
                    <span>{{ $t("prescriptions.fields.expirationDate") }}</span>
                    {{ formatPrescriptionDate(prescription.expirationDate) }}
                  </p>
                </div>

                <div
                  v-if="resolveDocumentsList(prescription.id).length"
                  class="patient-prescriptions-page__related-links"
                >
                  <q-btn
                    v-for="document in resolveDocumentsList(prescription.id)"
                    :key="document.id"
                    flat
                    color="positive"
                    icon="download"
                    no-caps
                    :href="document.downloadUrl"
                    :label="
                      $t('prescriptions.downloadDocumentLink', {
                        filename: document.originalFilename,
                      })
                    "
                    target="_blank"
                  />
                </div>
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
                <q-btn
                  :key="`delete-${prescription.id}`"
                  flat
                  color="negative"
                  icon="delete"
                  no-caps
                  :disable="Boolean(prescription.deletedAt)"
                  :loading="isPrescriptionDeleting"
                  :label="$t('prescriptions.deleteAction')"
                  @click="handleDeletePrescription(prescription)"
                />
              </div>
            </div>
          </q-card>

          <div
            v-if="pagination.totalPages > 1"
            class="patient-prescriptions-page__pagination"
          >
            <q-pagination
              :model-value="pagination.page"
              :max="pagination.totalPages"
              :max-pages="7"
              boundary-numbers
              direction-links
              @update:model-value="handlePageChange"
            />
          </div>
        </div>

        <q-card v-else flat class="patient-prescriptions-page__empty">
          <p class="patient-prescriptions-page__eyebrow">
            {{ $t("prescriptions.emptyEyebrow") }}
          </p>
          <h2 class="patient-prescriptions-page__empty-title">
            {{
              hasActiveFilters
                ? $t("prescriptions.emptyFilteredTitle")
                : $t("prescriptions.emptyTitle")
            }}
          </h2>
          <p class="patient-prescriptions-page__subtitle">
            {{
              hasActiveFilters
                ? $t("prescriptions.emptyFilteredDescription")
                : $t("prescriptions.emptyDescription")
            }}
          </p>
        </q-card>
      </template>
    </section>

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

.patient-prescriptions-page__banner {
  margin-bottom: 0.5rem;
}

.patient-prescriptions-page__hero {
  display: grid;
  gap: 1.25rem;
}

.patient-prescriptions-page__loading,
.patient-prescriptions-page__header,
.patient-prescriptions-page__prescription-head,
.patient-prescriptions-page__prescription-title-row,
.patient-prescriptions-page__actions,
.patient-prescriptions-page__related-links {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.patient-prescriptions-page__header {
  padding: 1.5rem;
  border-radius: 1.5rem;
  background:
    linear-gradient(135deg, rgba(20, 50, 63, 0.92), rgba(36, 89, 110, 0.88)),
    #16313f;
  color: white;
}

.patient-prescriptions-page__loading {
  justify-content: center;
  padding: 3rem 1rem;
}

.patient-prescriptions-page__eyebrow {
  margin: 0 0 0.5rem;
  color: #d99866;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.patient-prescriptions-page__title,
.patient-prescriptions-page__empty-title,
.patient-prescriptions-page__prescription-title {
  margin: 0;
  font-family: "Fraunces", serif;
}

.patient-prescriptions-page__title {
  font-size: clamp(2rem, 4vw, 2.8rem);
}

.patient-prescriptions-page__subtitle,
.patient-prescriptions-page__prescription-copy,
.patient-prescriptions-page__prescription-meta {
  margin: 0;
  line-height: 1.6;
}

.patient-prescriptions-page__subtitle {
  max-width: 42rem;
  color: rgba(255, 255, 255, 0.82);
}

.patient-prescriptions-page__summary {
  display: flex;
}

.patient-prescriptions-page__filters {
  display: grid;
  gap: 1rem;
  padding: 1rem;
  border: 1px solid rgba(20, 50, 63, 0.08);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.9);
}

.patient-prescriptions-page__filter-grid {
  display: grid;
  align-items: center;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.85rem;
}

.patient-prescriptions-page__filter-actions,
.patient-prescriptions-page__pagination {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.75rem;
}

.patient-prescriptions-page__list {
  display: grid;
  gap: 1rem;
}

.patient-prescriptions-page__prescription,
.patient-prescriptions-page__empty {
  padding: 1.4rem;
  border: 1px solid rgba(20, 50, 63, 0.08);
  border-radius: 1.35rem;
  background: rgba(255, 255, 255, 0.88);
}

.patient-prescriptions-page__prescription-main,
.patient-prescriptions-page__prescription-actions {
  display: grid;
  gap: 1rem;
}

.patient-prescriptions-page__prescription-main {
  flex: 1;
}

.patient-prescriptions-page__prescription-title-row {
  align-items: center;
  justify-content: flex-start;
}

.patient-prescriptions-page__prescription-title {
  color: #16313f;
  font-size: 1.35rem;
}

.patient-prescriptions-page__prescription-copy {
  color: #415463;
}

.patient-prescriptions-page__prescription-meta-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.85rem;
}

.patient-prescriptions-page__prescription-meta {
  padding: 0.85rem 1rem;
  border-radius: 1rem;
  background: #f7f1e8;
  color: #284455;
}

.patient-prescriptions-page__prescription-meta span {
  display: block;
  margin-bottom: 0.25rem;
  color: #9a5c2b;
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.patient-prescriptions-page__related-links {
  justify-content: flex-start;
  flex-wrap: wrap;
}

@media (max-width: 900px) {
  .patient-prescriptions-page__header,
  .patient-prescriptions-page__prescription-head {
    flex-direction: column;
  }

  .patient-prescriptions-page__filter-grid,
  .patient-prescriptions-page__prescription-meta-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .patient-prescriptions-page__actions {
    width: 100%;
    justify-content: flex-start;
    flex-wrap: wrap;
  }
}

@media (max-width: 720px) {
  .patient-prescriptions-page__filter-grid,
  .patient-prescriptions-page__prescription-meta-grid {
    grid-template-columns: 1fr;
  }

  .patient-prescriptions-page__filter-actions,
  .patient-prescriptions-page__pagination {
    justify-content: flex-start;
    flex-wrap: wrap;
  }
}
</style>
