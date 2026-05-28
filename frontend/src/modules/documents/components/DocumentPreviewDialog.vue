<script setup lang="ts">
import { computed } from "vue";

import type { DocumentRecord } from "../types";

const props = defineProps<{
  document: DocumentRecord | null;
  modelValue: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
}>();

const previewUrl = computed(
  () => props.document?.previewUrl ?? props.document?.downloadUrl ?? "",
);

const isPreviewable = computed(() => {
  const mimeType = props.document?.mimeType ?? "";

  return mimeType === "application/pdf" || mimeType.startsWith("image/");
});

const handleModelValueUpdate = (value: boolean) => {
  emit("update:modelValue", value);
};

const closePreview = () => {
  emit("update:modelValue", false);
};
</script>

<template>
  <q-dialog
    :model-value="modelValue"
    @update:model-value="handleModelValueUpdate"
  >
    <q-card class="document-preview-dialog">
      <div class="document-preview-dialog__header">
        <div class="document-preview-dialog__heading">
          <p class="document-preview-dialog__eyebrow">
            {{ $t("documents.previewDialog.title") }}
          </p>
          <h2 class="document-preview-dialog__title">
            {{ document?.originalFilename }}
          </h2>
          <p
            v-if="document"
            class="document-preview-dialog__meta"
          >
            {{ $t(`documents.types.${document.documentType}`) }} ·
            {{ document.mimeType }}
          </p>
        </div>

        <div class="document-preview-dialog__actions">
          <q-btn
            v-if="document"
            color="primary"
            flat
            no-caps
            icon="download"
            :href="document.downloadUrl"
            :label="$t('documents.downloadAction')"
            target="_blank"
          />
          <q-btn
            flat
            round
            color="primary"
            icon="close"
            :aria-label="$t('documents.previewDialog.close')"
            @click="closePreview"
          />
        </div>
      </div>

      <q-separator />

      <div class="document-preview-dialog__body">
        <iframe
          v-if="document && isPreviewable"
          class="document-preview-dialog__frame"
          :src="previewUrl"
          :title="
            $t('documents.previewDialog.frameTitle', {
              filename: document.originalFilename,
            })
          "
        />

        <div
          v-else
          class="document-preview-dialog__unsupported"
        >
          <q-icon
            name="insert_drive_file"
            size="3rem"
          />
          <h3>{{ $t("documents.previewDialog.unsupportedTitle") }}</h3>
          <p>{{ $t("documents.previewDialog.unsupportedDescription") }}</p>
          <q-btn
            v-if="document"
            color="primary"
            unelevated
            no-caps
            icon="download"
            :href="document.downloadUrl"
            :label="$t('documents.downloadAction')"
            target="_blank"
          />
        </div>
      </div>
    </q-card>
  </q-dialog>
</template>

<style scoped>
.document-preview-dialog {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  width: min(96vw, 88rem);
  height: min(92vh, 64rem);
  max-width: 96vw;
  max-height: 92vh;
  border-radius: 8px;
  overflow: hidden;
}

.document-preview-dialog__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem 1.25rem;
  background: #ffffff;
}

.document-preview-dialog__heading {
  min-width: 0;
}

.document-preview-dialog__eyebrow {
  margin: 0 0 0.3rem;
  color: #6c8f7d;
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.document-preview-dialog__title {
  margin: 0;
  color: #14323f;
  font-size: 1.15rem;
  line-height: 1.3;
  overflow-wrap: anywhere;
}

.document-preview-dialog__meta {
  margin: 0.35rem 0 0;
  color: #5b6c73;
  font-size: 0.9rem;
  overflow-wrap: anywhere;
}

.document-preview-dialog__actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 0.35rem;
}

.document-preview-dialog__body {
  min-height: 0;
  background: #eef2f4;
}

.document-preview-dialog__frame {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
  background: #ffffff;
}

.document-preview-dialog__unsupported {
  display: grid;
  place-items: center;
  align-content: center;
  gap: 0.75rem;
  height: 100%;
  padding: 2rem;
  color: #415463;
  text-align: center;
}

.document-preview-dialog__unsupported h3,
.document-preview-dialog__unsupported p {
  margin: 0;
}

@media (max-width: 720px) {
  .document-preview-dialog {
    width: 100vw;
    height: 100vh;
    max-width: 100vw;
    max-height: 100vh;
    border-radius: 0;
  }

  .document-preview-dialog__header {
    flex-direction: column;
  }

  .document-preview-dialog__actions {
    width: 100%;
    justify-content: space-between;
  }
}
</style>
