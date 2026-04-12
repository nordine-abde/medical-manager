<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";

import { useDocumentsStore } from "../store";
import {
  documentTypes,
  type DocumentRecord,
  type DocumentType,
  type RelatedEntityType,
} from "../types";

interface Props {
  allowUpload?: boolean;
  description?: string;
  documents: DocumentRecord[];
  emptyDescription?: string;
  emptyTitle: string;
  eyebrow: string;
  patientId?: string;
  relatedEntityId?: string;
  relatedEntityType?: RelatedEntityType;
  title: string;
}

const props = withDefaults(defineProps<Props>(), {
  allowUpload: false,
  description: "",
  emptyDescription: "",
  patientId: "",
  relatedEntityId: "",
});

const documentsStore = useDocumentsStore();
const { d, t } = useI18n();

const errorMessage = ref("");
const isSaving = ref(false);
const selectedDocumentType = ref<DocumentType>("general_attachment");
const selectedFile = ref<File | null>(null);
const uploadNotes = ref("");

const documentTypeOptions = computed(() =>
  documentTypes.map((documentType) => ({
    label: t(`documents.types.${documentType}`),
    value: documentType,
  })),
);

const canUpload = computed(
  () =>
    props.allowUpload &&
    props.patientId.length > 0 &&
    props.relatedEntityId.length > 0 &&
    props.relatedEntityType !== undefined &&
    selectedFile.value instanceof File,
);

const formatUploadedAt = (value: string) => d(new Date(value), "short");

const resetUploadForm = () => {
  selectedDocumentType.value = "general_attachment";
  selectedFile.value = null;
  uploadNotes.value = "";
};

const handleUpload = async () => {
  if (!canUpload.value || !props.relatedEntityType) {
    return;
  }

  if (!(selectedFile.value instanceof File)) {
    errorMessage.value = t("documents.validation.fileRequired");
    return;
  }

  errorMessage.value = "";
  isSaving.value = true;

  try {
    await documentsStore.uploadDocument(props.patientId, {
      documentType: selectedDocumentType.value,
      file: selectedFile.value,
      notes: uploadNotes.value.trim() || null,
      relatedEntityId: props.relatedEntityId,
      relatedEntityType: props.relatedEntityType,
    });
    resetUploadForm();
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : t("documents.genericError");
  } finally {
    isSaving.value = false;
  }
};
</script>

<template>
  <div class="related-documents-panel">
    <div class="related-documents-panel__header">
      <div>
        <p class="related-documents-panel__eyebrow">{{ eyebrow }}</p>
        <h3 class="related-documents-panel__title">{{ title }}</h3>
        <p
          v-if="description"
          class="related-documents-panel__description"
        >
          {{ description }}
        </p>
      </div>
    </div>

    <q-banner
      v-if="errorMessage"
      rounded
      class="related-documents-panel__banner"
    >
      {{ errorMessage }}
    </q-banner>

    <div
      v-if="documents.length"
      class="related-documents-panel__list"
    >
      <q-card
        v-for="document in documents"
        :key="document.id"
        flat
        class="related-documents-panel__item"
      >
        <div class="related-documents-panel__item-head">
          <div class="related-documents-panel__item-main">
            <div class="related-documents-panel__item-title-row">
              <h4 class="related-documents-panel__item-title">
                {{ document.originalFilename }}
              </h4>
              <q-badge
                rounded
                color="primary"
                text-color="white"
                :label="$t(`documents.types.${document.documentType}`)"
              />
            </div>

            <p class="related-documents-panel__item-meta">
              <span>{{ $t("documents.uploadedAt") }}</span>
              {{ formatUploadedAt(document.uploadedAt) }}
            </p>

            <p
              v-if="document.notes"
              class="related-documents-panel__item-notes"
            >
              {{ document.notes }}
            </p>
          </div>

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
      </q-card>
    </div>
    <q-card
      v-else
      flat
      class="related-documents-panel__empty"
    >
      <p class="related-documents-panel__eyebrow">{{ eyebrow }}</p>
      <h4 class="related-documents-panel__empty-title">{{ emptyTitle }}</h4>
      <p
        v-if="emptyDescription"
        class="related-documents-panel__description"
      >
        {{ emptyDescription }}
      </p>
    </q-card>

    <q-card
      v-if="allowUpload"
      flat
      class="related-documents-panel__upload"
    >
      <q-card-section class="related-documents-panel__upload-grid">
        <q-file
          v-model="selectedFile"
          clearable
          outlined
          dense
          accept="application/pdf,image/jpeg,image/png,image/webp"
          :label="$t('documents.fields.file')"
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
  </div>
</template>

<style scoped>
.related-documents-panel {
  display: grid;
  gap: 1rem;
}

.related-documents-panel__header,
.related-documents-panel__item-head {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  justify-content: space-between;
}

.related-documents-panel__eyebrow {
  margin: 0 0 0.35rem;
  color: #5b6c73;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.related-documents-panel__title,
.related-documents-panel__empty-title,
.related-documents-panel__item-title {
  margin: 0;
  color: #14323f;
  font-family: "Newsreader Variable", serif;
}

.related-documents-panel__title {
  font-size: 1.35rem;
}

.related-documents-panel__empty-title,
.related-documents-panel__item-title {
  font-size: 1rem;
}

.related-documents-panel__description,
.related-documents-panel__item-meta,
.related-documents-panel__item-notes {
  margin: 0;
  color: #5b6c73;
}

.related-documents-panel__banner {
  background: rgba(183, 80, 63, 0.14);
  color: #7f2e22;
}

.related-documents-panel__list {
  display: grid;
  gap: 0.75rem;
}

.related-documents-panel__item,
.related-documents-panel__empty,
.related-documents-panel__upload {
  border-radius: 1.25rem;
  background: rgba(246, 244, 239, 0.85);
  padding: 1rem;
}

.related-documents-panel__item-main {
  display: grid;
  gap: 0.5rem;
}

.related-documents-panel__item-title-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
}

.related-documents-panel__item-meta span {
  display: block;
  color: #14323f;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.related-documents-panel__upload-grid {
  display: grid;
  gap: 0.75rem;
}
</style>
