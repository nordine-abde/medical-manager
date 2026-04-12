<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";

import type { DocumentRecord } from "../../documents/types";
import type { CareEventRecord } from "../../care-events/types";

const props = withDefaults(
  defineProps<{
    careEvent?: CareEventRecord | null;
    documents?: DocumentRecord[];
    errorMessage?: string;
    loading?: boolean;
    modelValue: boolean;
    patientName?: string;
  }>(),
  {
    careEvent: null,
    documents: () => [],
    errorMessage: "",
    loading: false,
    patientName: "",
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
}>();

const { d, t } = useI18n();

const formattedCompletedAt = computed(() =>
  props.careEvent ? d(new Date(props.careEvent.completedAt), "short") : "",
);

const dialogTitle = computed(() => {
  if (!props.careEvent) {
    return t("timeline.careEventDetailTitle");
  }

  const titleParts = [t(`careEvents.types.${props.careEvent.eventType}`)];
  const subtype = props.careEvent.subtype?.trim();

  if (subtype) {
    titleParts.push(subtype);
  }

  titleParts.push(formattedCompletedAt.value);

  return titleParts.join(" · ");
});

const closeDialog = () => emit("update:modelValue", false);
</script>

<template>
  <q-dialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <q-card class="timeline-care-event-dialog">
      <q-card-section class="timeline-care-event-dialog__header">
        <div>
          <p class="timeline-care-event-dialog__eyebrow">
            {{ $t("timeline.careEventDetailEyebrow") }}
          </p>
          <h3 class="timeline-care-event-dialog__title">{{ dialogTitle }}</h3>
          <p
            v-if="patientName"
            class="timeline-care-event-dialog__patient"
          >
            {{ patientName }}
          </p>
        </div>

        <q-btn
          flat
          round
          dense
          icon="close"
          :aria-label="$t('timeline.closeDetail')"
          @click="closeDialog"
        />
      </q-card-section>

      <q-banner
        v-if="errorMessage"
        rounded
        class="timeline-care-event-dialog__banner"
      >
        <template #avatar>
          <q-icon
            name="error"
            color="negative"
          />
        </template>
        {{ errorMessage }}
      </q-banner>

      <q-card-section
        v-if="loading"
        class="timeline-care-event-dialog__loading"
      >
        <q-spinner
          color="primary"
          size="2rem"
        />
        <span>{{ $t("timeline.loadingDetail") }}</span>
      </q-card-section>

      <q-card-section
        v-else-if="careEvent"
        class="timeline-care-event-dialog__content"
      >
        <div class="timeline-care-event-dialog__grid">
          <div class="timeline-care-event-dialog__field">
            <span class="timeline-care-event-dialog__label">
              {{ $t("careEvents.fields.eventType") }}
            </span>
            <strong>{{ $t(`careEvents.types.${careEvent.eventType}`) }}</strong>
          </div>

          <div class="timeline-care-event-dialog__field">
            <span class="timeline-care-event-dialog__label">
              {{ $t("careEvents.fields.subtype") }}
            </span>
            <strong>{{ careEvent.subtype || $t("careEvents.emptySubtype") }}</strong>
          </div>

          <div class="timeline-care-event-dialog__field">
            <span class="timeline-care-event-dialog__label">
              {{ $t("careEvents.fields.completedAt") }}
            </span>
            <strong>{{ formattedCompletedAt }}</strong>
          </div>

          <div class="timeline-care-event-dialog__field">
            <span class="timeline-care-event-dialog__label">
              {{ $t("careEvents.fields.providerName") }}
            </span>
            <strong>{{
              careEvent.providerName || $t("careEvents.emptyProviderName")
            }}</strong>
          </div>
        </div>

        <div class="timeline-care-event-dialog__section">
          <span class="timeline-care-event-dialog__label">
            {{ $t("careEvents.fields.outcomeNotes") }}
          </span>
          <p class="timeline-care-event-dialog__notes">
            {{ careEvent.outcomeNotes || $t("careEvents.emptyOutcomeNotes") }}
          </p>
        </div>

        <div class="timeline-care-event-dialog__section">
          <span class="timeline-care-event-dialog__label">
            {{ $t("careEvents.resultDocument.title") }}
          </span>

          <div
            v-if="documents.length"
            class="timeline-care-event-dialog__documents"
          >
            <q-btn
              v-for="document in documents"
              :key="document.id"
              color="primary"
              flat
              no-caps
              icon="download"
              :href="document.downloadUrl"
              :label="$t('careEvents.downloadDocumentLink', { filename: document.originalFilename })"
              target="_blank"
            />
          </div>

          <p
            v-else
            class="timeline-care-event-dialog__notes"
          >
            {{ $t("timeline.noCareEventDocuments") }}
          </p>
        </div>
      </q-card-section>

      <q-card-actions align="right">
        <q-btn
          flat
          no-caps
          :label="$t('common.close')"
          @click="closeDialog"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<style scoped>
.timeline-care-event-dialog {
  width: min(100%, 42rem);
  max-width: 42rem;
  border-radius: 1rem;
}

.timeline-care-event-dialog__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.timeline-care-event-dialog__eyebrow {
  margin: 0 0 0.35rem;
  color: #5b6c73;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.timeline-care-event-dialog__title {
  margin: 0;
  color: #14323f;
  font-size: 1.25rem;
  font-weight: 600;
}

.timeline-care-event-dialog__patient {
  margin: 0.4rem 0 0;
  color: #5b6c73;
  font-size: 0.95rem;
}

.timeline-care-event-dialog__banner {
  margin: 0 1rem;
}

.timeline-care-event-dialog__loading {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  color: #5b6c73;
}

.timeline-care-event-dialog__content {
  display: grid;
  gap: 1.25rem;
}

.timeline-care-event-dialog__grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
}

.timeline-care-event-dialog__field,
.timeline-care-event-dialog__section {
  display: grid;
  gap: 0.35rem;
}

.timeline-care-event-dialog__label {
  color: #5b6c73;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.timeline-care-event-dialog__notes {
  margin: 0;
  color: #14323f;
  line-height: 1.6;
  white-space: pre-wrap;
}

.timeline-care-event-dialog__documents {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
</style>
