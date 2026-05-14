<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";

import { useAuthStore } from "../../auth/store";
import BookingFormDialog from "../../bookings/components/BookingFormDialog.vue";
import { useBookingsStore } from "../../bookings/store";
import type {
  BookingRecord,
  BookingStatus,
  BookingUpsertPayload,
  FacilityUpsertPayload,
} from "../../bookings/types";
import ConditionFormDialog from "../../conditions/components/ConditionFormDialog.vue";
import { useConditionsStore } from "../../conditions/store";
import type {
  ConditionRecord,
  ConditionUpsertPayload,
} from "../../conditions/types";
import RelatedDocumentsPanel from "../../documents/components/RelatedDocumentsPanel.vue";
import { useDocumentsStore } from "../../documents/store";
import { filterDocumentsByRelatedEntity } from "../../documents/utils";
import MedicationFormDialog from "../../medications/components/MedicationFormDialog.vue";
import { useMedicationsStore } from "../../medications/store";
import type {
  LinkedMedicationPrescriptionRecord,
  MedicationRecord,
  MedicationUpsertPayload,
} from "../../medications/types";
import PrescriptionFormDialog from "../../prescriptions/components/PrescriptionFormDialog.vue";
import { usePrescriptionsStore } from "../../prescriptions/store";
import type {
  PrescriptionRecord,
  PrescriptionStatus,
  PrescriptionType,
  PrescriptionUpsertPayload,
} from "../../prescriptions/types";
import PatientFormDialog from "../components/PatientFormDialog.vue";
import { usePatientsStore } from "../store";
import type {
  PatientOverviewAppointmentRecord,
  PatientOverviewMedicationRecord,
  PatientOverviewPrescriptionRecord,
  PatientRecord,
  PatientUserRecord,
  PatientUpsertPayload,
} from "../types";

const authStore = useAuthStore();
const patientsStore = usePatientsStore();
const conditionsStore = useConditionsStore();
const medicationsStore = useMedicationsStore();
const prescriptionsStore = usePrescriptionsStore();
const bookingsStore = useBookingsStore();
const documentsStore = useDocumentsStore();
const route = useRoute();
const router = useRouter();
const { d, t } = useI18n();

const isLoading = ref(false);
const isPatientSaving = ref(false);
const isConditionSaving = ref(false);
const isMedicationSaving = ref(false);
const isPrescriptionSaving = ref(false);
const isBookingSaving = ref(false);
const isPatientUsersSaving = ref(false);
const isPatientFormOpen = ref(false);
const isConditionFormOpen = ref(false);
const isMedicationFormOpen = ref(false);
const isPrescriptionFormOpen = ref(false);
const isBookingFormOpen = ref(false);
const showInactiveConditions = ref(false);
const patientUserIdentifier = ref("");
const editingCondition = ref<ConditionRecord | null>(null);
const editingMedication = ref<MedicationRecord | null>(null);
const editingPrescription = ref<PrescriptionRecord | null>(null);
const editingBooking = ref<BookingRecord | null>(null);
const errorMessage = ref("");

const patientId = computed(() => route.params.patientId as string);
const patient = computed(() => patientsStore.currentPatient);
const patientUsers = computed(() => patientsStore.patientUsers);
const overview = computed(() => patientsStore.currentOverview);
const currentUserId = computed(() => authStore.user?.id ?? null);
const conditions = computed(() => conditionsStore.conditions);
const activeConditions = computed(() => conditionsStore.activeConditions);
const medications = computed(() => medicationsStore.activeMedications);
const prescriptions = computed(() => prescriptionsStore.prescriptions);
const bookings = computed(() => bookingsStore.activeBookings);
const facilities = computed(() => bookingsStore.facilities);
const documents = computed(() => documentsStore.documents);
const hasInactiveConditions = computed(
  () => conditionsStore.inactiveConditions.length > 0,
);
const todayDate = computed(() => new Date().toISOString().slice(0, 10));
const nowDateTime = computed(() => new Date().toISOString());

const upcomingBookings = computed(() =>
  bookings.value.filter((booking) => {
    if (booking.status === "completed" || booking.status === "cancelled") {
      return false;
    }

    if (booking.appointmentAt) {
      return booking.appointmentAt >= nowDateTime.value;
    }

    return true;
  }),
);

const overviewMetricCards = computed(() => [
    {
    count: overview.value?.upcomingAppointments.length ?? 0,
    description: t("patients.overviewCards.upcomingAppointments.description"),
    eyebrow: t("patients.overviewCards.upcomingAppointments.eyebrow"),
    icon: "event_upcoming",
    toneClass: "patient-overview-page__overview-card--info",
  },
  {
    count: overview.value?.pendingPrescriptions.length ?? 0,
    description: t("patients.overviewCards.pendingPrescriptions.description"),
    eyebrow: t("patients.overviewCards.pendingPrescriptions.eyebrow"),
    icon: "medication",
    toneClass: "patient-overview-page__overview-card--accent",
  },
  {
    count: overview.value?.activeMedications.length ?? 0,
    description: t("patients.overviewCards.activeMedications.description"),
    eyebrow: t("patients.overviewCards.activeMedications.eyebrow"),
    icon: "medication",
    toneClass: "patient-overview-page__overview-card--calm",
  },
  {
    count: overview.value?.activeConditions.length ?? 0,
    description: t("patients.overviewCards.activeConditions.description"),
    eyebrow: t("patients.overviewCards.activeConditions.eyebrow"),
    icon: "favorite",
    toneClass: "patient-overview-page__overview-card--info",
  },
]);

const overviewQuickActions = computed(() => [
  {
    icon: "medication",
    label: t("prescriptions.createAction"),
    onClick: openCreatePrescriptionDialog,
  },
  {
    icon: "event",
    label: t("bookings.createAction"),
    onClick: openCreateBookingDialog,
  },
]);

const medicationConditionOptions = computed(() => [
  {
    label: t("medications.unlinkedCondition"),
    value: null,
  },
  ...activeConditions.value.map((condition) => ({
    label: condition.name,
    value: condition.id,
  })),
]);

const prescriptionSubtypeOptionsByType = computed<
  Record<PrescriptionType, string[]>
>(() => {
  const subtypeMap: Record<PrescriptionType, Set<string>> = {
    exam: new Set<string>(),
    medication: new Set<string>(),
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
    medication: [...subtypeMap.medication].sort((left, right) =>
      left.localeCompare(right),
    ),
    therapy: [...subtypeMap.therapy].sort((left, right) =>
      left.localeCompare(right),
    ),
    visit: [...subtypeMap.visit].sort((left, right) =>
      left.localeCompare(right),
    ),
  };
});

const bookingPrescriptionOptions = computed(() => [
  {
    label: t("bookings.unlinkedPrescription"),
    value: null,
  },
  ...prescriptions.value.map((prescription) => ({
    label: `${t(`prescriptions.types.${prescription.prescriptionType}`)} · ${t(
      `prescriptions.statuses.${prescription.status}`,
    )}`,
    value: prescription.id,
  })),
]);

const facilityOptions = computed(() =>
  facilities.value.map((facility) => ({
    label: [facility.name, facility.city].filter(Boolean).join(" · "),
    value: facility.id,
  })),
);

const canSubmitPatientUser = computed(
  () => patientUserIdentifier.value.trim().length > 0 && !isPatientUsersSaving.value,
);

const loadPrescriptions = async () => {
  errorMessage.value = "";

  try {
    await prescriptionsStore.loadPrescriptions(patientId.value);
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : t("prescriptions.genericError");
  }
};

const loadBookings = async () => {
  errorMessage.value = "";

  try {
    await Promise.all([
      bookingsStore.loadBookings(patientId.value),
      bookingsStore.loadFacilities(),
    ]);
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : t("bookings.genericError");
  }
};

const loadOverview = async () => {
  errorMessage.value = "";

  try {
    await patientsStore.loadOverview(patientId.value);
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : t("patients.genericError");
  }
};

const loadPatientUsers = async () => {
  errorMessage.value = "";

  try {
    await patientsStore.loadPatientUsers(patientId.value);
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : t("patients.genericError");
  }
};

const loadPage = async () => {
  isLoading.value = true;
  errorMessage.value = "";

  try {
    await Promise.all([
      patientsStore.loadPatient(patientId.value),
      patientsStore.loadPatientUsers(patientId.value),
      patientsStore.loadOverview(patientId.value),
      conditionsStore.loadConditions(patientId.value, {
        includeInactive: showInactiveConditions.value,
      }),
      documentsStore.loadDocuments(patientId.value),
      medicationsStore.loadMedications(patientId.value),
      prescriptionsStore.loadPrescriptions(patientId.value),
            bookingsStore.loadBookings(patientId.value),
      bookingsStore.loadFacilities(),
    ]);
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : t("patients.genericError");
  } finally {
    isLoading.value = false;
  }
};

const scrollToRouteHash = async () => {
  if (!route.hash) {
    return;
  }

  await nextTick();
  document.querySelector(route.hash)?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
};

const refreshOverview = async () => {
  await loadOverview();
};

const getPrescriptionDocuments = (prescriptionId: string) =>
  filterDocumentsByRelatedEntity(
    documents.value,
    "prescription",
    prescriptionId,
  );

const getBookingDocuments = (bookingId: string) =>
  filterDocumentsByRelatedEntity(documents.value, "booking", bookingId);

const loadConditions = async () => {
  errorMessage.value = "";

  try {
    await conditionsStore.loadConditions(patientId.value, {
      includeInactive: showInactiveConditions.value,
    });
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : t("conditions.genericError");
  }
};

watch(patientId, async () => {
  await loadPage();
  await scrollToRouteHash();
});

watch(showInactiveConditions, async () => {
  await loadConditions();
});

onMounted(async () => {
  await loadPage();
  await scrollToRouteHash();
});

const formatDateOfBirth = (value: string | null) => {
  if (!value) {
    return t("patients.emptyDateOfBirth");
  }

  return d(new Date(`${value}T00:00:00`), "short");
};

const formatLinkedAt = (value: string) => d(new Date(value), "short");

const formatPrescriptionDate = (value: string | null) => {
  if (!value) {
    return t("prescriptions.emptyDate");
  }

  return d(new Date(`${value}T00:00:00`), "short");
};

const formatPrescriptionDateTime = (value: string | null) => {
  if (!value) {
    return t("prescriptions.emptyDate");
  }

  return d(new Date(value), "short");
};

const formatMedicationDate = (value: string | null) => {
  if (!value) {
    return t("medications.emptyDate");
  }

  return d(new Date(`${value}T00:00:00`), "short");
};

const formatBookingDateTime = (value: string | null) => {
  if (!value) {
    return t("bookings.emptyDate");
  }

  return d(new Date(value), "short");
};

const formatOverviewAppointmentMeta = (
  appointment: PatientOverviewAppointmentRecord,
) => {
  const metaParts = [formatBookingDateTime(appointment.appointmentAt)];
  const facilityLabel = resolveBookingFacilityLabel(appointment.facilityId);

  if (facilityLabel !== t("bookings.unlinkedFacility")) {
    metaParts.push(facilityLabel);
  }

  return metaParts.join(" · ");
};

const formatOverviewPrescriptionMeta = (
  prescription: PatientOverviewPrescriptionRecord,
) => {
  const statusLabel = t(`prescriptions.statuses.${prescription.status}`);
  const dateLabel = prescription.expirationDate
    ? `${t("prescriptions.fields.expirationDate")}: ${formatPrescriptionDate(
        prescription.expirationDate,
      )}`
    : null;

  return [statusLabel, dateLabel].filter(Boolean).join(" · ");
};

const formatOverviewMedicationMeta = (
  medication: PatientOverviewMedicationRecord,
) => {
  const renewalStatus = null;
  const renewalDueDate = null;
  const nextGpDate = medication.nextGpContactDate
    ? `${t("medications.fields.nextGpContactDate")}: ${formatMedicationDate(
        medication.nextGpContactDate,
      )}`
    : null;

  return [
    medication.conditionName,
    renewalStatus,
    renewalDueDate,
    nextGpDate,
  ]
    .filter(Boolean)
    .join(" · ");
};

const resolveMedicationConditionLabel = (conditionId: string | null) => {
  if (!conditionId) {
    return t("medications.unlinkedCondition");
  }

  return (
    conditions.value.find((condition) => condition.id === conditionId)?.name ??
    t("medications.missingCondition")
  );
};

const resolveMedicationLinkedPrescriptionLabel = (
  prescription: LinkedMedicationPrescriptionRecord,
) =>
  [
    resolvePrescriptionTypeLabel(prescription),
    t(`prescriptions.statuses.${prescription.status}`),
    prescription.issueDate
      ? `${t("prescriptions.fields.issueDate")}: ${formatPrescriptionDate(
          prescription.issueDate,
        )}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

const scrollToMedicationsSection = () => {
  document
    .getElementById("patient-medications-section")
    ?.scrollIntoView({ behavior: "smooth", block: "start" });
};

const resolvePrescriptionTypeLabel = (prescription: {
  prescriptionType: string;
  subtype?: string | null;
}) => {
  const typeLabel = t(`prescriptions.types.${prescription.prescriptionType}`);
  const subtype = prescription.subtype?.trim();

  return subtype ? `${typeLabel} · ${subtype}` : typeLabel;
};

const resolveBookingFacilityLabel = (facilityId: string | null) => {
  if (!facilityId) {
    return t("bookings.unlinkedFacility");
  }

  const facility = facilities.value.find((item) => item.id === facilityId);

  if (!facility) {
    return t("bookings.missingFacility");
  }

  return [facility.name, facility.city].filter(Boolean).join(" · ");
};

const resolveBookingPrescriptionLabel = (prescriptionId: string | null) => {
  if (!prescriptionId) {
    return t("bookings.unlinkedPrescription");
  }

  const prescription = prescriptions.value.find(
    (item) => item.id === prescriptionId,
  );

  if (!prescription) {
    return t("bookings.missingPrescription");
  }

  return `${resolvePrescriptionTypeLabel(prescription)} · ${t(
    `prescriptions.statuses.${prescription.status}`,
  )}`;
};

const nextBookingStatus = (
  status: BookingStatus,
): BookingStatus | null => {
  switch (status) {
    case "not_booked":
      return "booking_in_progress";
    case "booking_in_progress":
      return "booked";
    case "booked":
      return "completed";
    default:
      return null;
  }
};

const nextPrescriptionStatus = (
  status: PrescriptionStatus,
): PrescriptionStatus | null => {
  switch (status) {
    case "needed":
      return "requested";
    case "requested":
      return "available";
    case "available":
      return "collected";
    case "collected":
      return "used";
    default:
      return null;
  }
};

const handleUpdate = async (payload: PatientUpsertPayload) => {
  isPatientSaving.value = true;
  errorMessage.value = "";

  try {
    await patientsStore.updatePatient(patientId.value, payload);
    isPatientFormOpen.value = false;
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : t("patients.genericError");
  } finally {
    isPatientSaving.value = false;
  }
};

const handleArchiveToggle = async () => {
  if (!patient.value) {
    return;
  }

  isPatientSaving.value = true;
  errorMessage.value = "";

  try {
    if (patient.value.archived) {
      await patientsStore.restorePatient(patient.value.id);
    } else {
      await patientsStore.archivePatient(patient.value.id);
    }
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : t("patients.genericError");
  } finally {
    isPatientSaving.value = false;
  }
};

const handleAddPatientUser = async () => {
  const identifier = patientUserIdentifier.value.trim();

  if (!identifier) {
    return;
  }

  isPatientUsersSaving.value = true;
  errorMessage.value = "";

  try {
    await patientsStore.addPatientUser(patientId.value, identifier);
    patientUserIdentifier.value = "";
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : t("patients.genericError");
  } finally {
    isPatientUsersSaving.value = false;
  }
};

const handleRemovePatientUser = async (userId: string) => {
  isPatientUsersSaving.value = true;
  errorMessage.value = "";

  try {
    await patientsStore.removePatientUser(patientId.value, userId);
    await refreshOverview();
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : t("patients.genericError");
  } finally {
    isPatientUsersSaving.value = false;
  }
};

const isCurrentUser = (user: PatientUserRecord) => user.id === currentUserId.value;

const openCreateConditionDialog = () => {
  editingCondition.value = null;
  isConditionFormOpen.value = true;
};

const openEditConditionDialog = (condition: ConditionRecord) => {
  editingCondition.value = condition;
  isConditionFormOpen.value = true;
};

const handleConditionSubmit = async (payload: ConditionUpsertPayload) => {
  isConditionSaving.value = true;
  errorMessage.value = "";

  try {
    if (editingCondition.value) {
      await conditionsStore.updateCondition(editingCondition.value.id, payload);
    } else {
      await conditionsStore.createCondition(patientId.value, payload);
    }

    await refreshOverview();
    isConditionFormOpen.value = false;
    editingCondition.value = null;
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : t("conditions.genericError");
  } finally {
    isConditionSaving.value = false;
  }
};

const handleDeactivateCondition = async (conditionId: string) => {
  isConditionSaving.value = true;
  errorMessage.value = "";

  try {
    await conditionsStore.deactivateCondition(conditionId);
    await refreshOverview();
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : t("conditions.genericError");
  } finally {
    isConditionSaving.value = false;
  }
};

const handleConditionDialogModelChange = (value: boolean) => {
  isConditionFormOpen.value = value;

  if (!value) {
    editingCondition.value = null;
  }
};

const openCreateMedicationDialog = () => {
  editingMedication.value = null;
  isMedicationFormOpen.value = true;
};

const openEditMedicationDialog = (medication: MedicationRecord) => {
  editingMedication.value = medication;
  isMedicationFormOpen.value = true;
};

const handleMedicationSubmit = async (payload: MedicationUpsertPayload) => {
  isMedicationSaving.value = true;
  errorMessage.value = "";

  try {
    if (editingMedication.value) {
      await medicationsStore.updateMedication(editingMedication.value.id, payload);
    } else {
      await medicationsStore.createMedication(patientId.value, payload);
    }

    await refreshOverview();
    isMedicationFormOpen.value = false;
    editingMedication.value = null;
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : t("medications.genericError");
  } finally {
    isMedicationSaving.value = false;
  }
};

const handleMedicationArchive = async (medicationId: string) => {
  isMedicationSaving.value = true;
  errorMessage.value = "";

  try {
    await medicationsStore.archiveMedication(medicationId);
    await refreshOverview();
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : t("medications.genericError");
  } finally {
    isMedicationSaving.value = false;
  }
};

const handleMedicationDialogModelChange = (value: boolean) => {
  isMedicationFormOpen.value = value;

  if (!value) {
    editingMedication.value = null;
  }
};

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
  statusPayload: {
    collectedAt?: string | null;
    receivedAt?: string | null;
    requestedAt?: string | null;
    status: PrescriptionStatus;
  };
}) => {
  isPrescriptionSaving.value = true;
  errorMessage.value = "";

  try {
    if (editingPrescription.value) {
      await prescriptionsStore.updatePrescription(
        editingPrescription.value.id,
        {
          expirationDate: payload.prescription.expirationDate,
          issueDate: payload.prescription.issueDate,
          notes: payload.prescription.notes,
          prescriptionType: payload.prescription.prescriptionType,
          subtype: payload.prescription.subtype,
          
        },
        {
          statusPayload: payload.statusPayload,
        },
      );

      if (payload.document) {
        await documentsStore.uploadDocument(patientId.value, {
          documentType: "prescription",
          file: payload.document.file,
          notes: payload.document.notes,
          relatedEntityId: editingPrescription.value.id,
          relatedEntityType: "prescription",
        });
      }
    } else {
      let createdPrescriptionId: string | null = null;

      try {

        const createdPrescription = await prescriptionsStore.createPrescription(
          patientId.value,
          {
            ...payload.prescription,
          },
        );        createdPrescriptionId = createdPrescription.id;

        if (payload.document) {
          await documentsStore.uploadDocument(patientId.value, {
            documentType: "prescription",
            file: payload.document.file,
            notes: payload.document.notes,
            relatedEntityId: createdPrescription.id,
            relatedEntityType: "prescription",
          });
        }
      } catch (error) {
        
        throw error;
      }
    }

    await refreshOverview();
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

const handleAdvancePrescriptionStatus = async (
  prescriptionId: string,
  status: PrescriptionStatus,
) => {
  isPrescriptionSaving.value = true;
  errorMessage.value = "";

  try {
    await prescriptionsStore.changePrescriptionStatus(prescriptionId, status);
    await refreshOverview();
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : t("prescriptions.genericError");
  } finally {
    isPrescriptionSaving.value = false;
  }
};

const openCreateBookingDialog = () => {
  editingBooking.value = null;
  isBookingFormOpen.value = true;
};

const openEditBookingDialog = (booking: BookingRecord) => {
  editingBooking.value = booking;
  isBookingFormOpen.value = true;
};

const handleBookingSubmit = async (
  payload: BookingUpsertPayload,
  statusPayload: {
    appointmentAt?: string | null;
    bookedAt?: string | null;
    status: BookingStatus;
  },
  facilityPayload: FacilityUpsertPayload | null,
) => {
  isBookingSaving.value = true;
  errorMessage.value = "";

  try {
    let facilityId = payload.facilityId;

    if (facilityPayload) {
      const createdFacility = await bookingsStore.createFacility(facilityPayload);
      facilityId = createdFacility.id;
    }

    const bookingPayload: BookingUpsertPayload = {
      ...payload,
      facilityId,
    };

    if (editingBooking.value) {
      await bookingsStore.updateBooking(
        editingBooking.value.id,
        {
          appointmentAt: bookingPayload.appointmentAt,
          bookedAt: bookingPayload.bookedAt,
          facilityId: bookingPayload.facilityId,
          notes: bookingPayload.notes,
          prescriptionId: bookingPayload.prescriptionId,
          
        },
        {
          statusPayload,
        },
      );
    } else {
      const createdBooking = await bookingsStore.createBooking(
        patientId.value,
        bookingPayload,
      );

      if (statusPayload.status !== createdBooking.status) {
        await bookingsStore.changeBookingStatus(
          createdBooking.id,
          statusPayload.status,
        );
      }
    }

    await refreshOverview();
    isBookingFormOpen.value = false;
    editingBooking.value = null;
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : t("bookings.genericError");
  } finally {
    isBookingSaving.value = false;
  }
};

const handleBookingDialogModelChange = (value: boolean) => {
  isBookingFormOpen.value = value;

  if (!value) {
    editingBooking.value = null;
  }
};

const handleAdvanceBookingStatus = async (
  bookingId: string,
  status: BookingStatus,
) => {
  isBookingSaving.value = true;
  errorMessage.value = "";

  try {
    await bookingsStore.changeBookingStatus(bookingId, status);
    await refreshOverview();
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : t("bookings.genericError");
  } finally {
    isBookingSaving.value = false;
  }
};
</script>

<template>
  <q-page class="patient-overview-page">
    <q-banner
      v-if="errorMessage"
      rounded
      class="patient-overview-page__banner"
    >
      {{ errorMessage }}
    </q-banner>

    <q-card
      flat
      bordered
      class="patient-overview-page__hero"
    >
      <q-card-section
        v-if="isLoading"
        class="patient-overview-page__loading"
      >
        <q-spinner color="primary" size="2rem" />
      </q-card-section>

      <q-card-section v-else-if="patient">
        <div class="patient-overview-page__header">
          <div>
            <p class="patient-overview-page__eyebrow">
              {{ $t("patients.overviewEyebrow") }}
            </p>
            <div class="patient-overview-page__title-row">
              <h1 class="patient-overview-page__title">{{ patient.fullName }}</h1>
              <q-badge
                v-if="patient.archived"
                color="warning"
                text-color="dark"
                rounded
                :label="$t('patients.archivedBadge')"
              />
            </div>
          </div>

          <div class="patient-overview-page__actions">
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
              icon="folder_shared"
              :label="$t('documents.openPageAction')"
              @click="router.push(`/app/patients/${patientId}/documents`)"
            />
            <q-btn
              outline
              color="primary"
              no-caps
              icon="edit"
              :label="$t('patients.edit')"
              @click="isPatientFormOpen = true"
            />
            <q-btn
              :color="patient.archived ? 'positive' : 'warning'"
              unelevated
              no-caps
              :loading="isPatientSaving"
              :icon="patient.archived ? 'history' : 'archive'"
              :label="
                patient.archived ? $t('patients.restoreAction') : $t('patients.archiveAction')
              "
              @click="handleArchiveToggle"
            />
          </div>
        </div>

        <div class="patient-overview-page__meta">
          <q-card
            flat
            class="patient-overview-page__meta-card"
          >
            <p class="patient-overview-page__meta-label">
              {{ $t("patients.fields.dateOfBirth") }}
            </p>
            <p class="patient-overview-page__meta-value">
              {{ formatDateOfBirth(patient.dateOfBirth) }}
            </p>
          </q-card>
          <q-card
            flat
            class="patient-overview-page__meta-card"
          >
            <p class="patient-overview-page__meta-label">
              {{ $t("patients.fields.notes") }}
            </p>
            <p class="patient-overview-page__meta-value patient-overview-page__notes">
              {{ patient.notes || $t("patients.emptyNotes") }}
            </p>
          </q-card>
        </div>

        <q-card
          flat
          class="patient-overview-page__sharing"
        >
          <q-card-section class="patient-overview-page__section-header">
            <div>
              <p class="patient-overview-page__summary-eyebrow">
                {{ $t("patients.sharing.eyebrow") }}
              </p>
              <h2 class="patient-overview-page__summary-title">
                {{ $t("patients.sharing.title") }}
              </h2>
              <p class="patient-overview-page__summary-copy">
                {{ $t("patients.sharing.description") }}
              </p>
            </div>

            <div class="patient-overview-page__sharing-form">
              <q-input
                v-model="patientUserIdentifier"
                dense
                outlined
                class="patient-overview-page__sharing-input"
                :label="$t('patients.sharing.identifierLabel')"
                :placeholder="$t('patients.sharing.identifierPlaceholder')"
                @keyup.enter="handleAddPatientUser"
              />
              <q-btn
                color="primary"
                unelevated
                no-caps
                icon="person_add"
                :disable="!canSubmitPatientUser"
                :loading="isPatientUsersSaving"
                :label="$t('patients.sharing.addAction')"
                @click="handleAddPatientUser"
              />
            </div>
          </q-card-section>

          <q-card-section>
            <div
              v-if="patientUsers.length > 0"
              class="patient-overview-page__sharing-list"
            >
              <q-card
                v-for="user in patientUsers"
                :key="user.id"
                flat
                class="patient-overview-page__sharing-card"
              >
                <div class="patient-overview-page__sharing-head">
                  <div class="patient-overview-page__sharing-main">
                    <div class="patient-overview-page__sharing-title-row">
                      <h3 class="patient-overview-page__condition-title">
                        {{ user.fullName }}
                      </h3>
                      <q-badge
                        v-if="isCurrentUser(user)"
                        color="secondary"
                        rounded
                        :label="$t('patients.sharing.currentUserBadge')"
                      />
                    </div>
                    <p class="patient-overview-page__sharing-copy">
                      {{ user.email }}
                    </p>
                    <p class="patient-overview-page__sharing-meta">
                      <span>{{ $t("patients.sharing.linkedAt") }}</span>
                      {{ formatLinkedAt(user.linkedAt) }}
                    </p>
                  </div>

                  <div class="patient-overview-page__section-actions">
                    <q-btn
                      color="negative"
                      flat
                      no-caps
                      icon="person_remove"
                      :disable="isCurrentUser(user)"
                      :loading="isPatientUsersSaving"
                      :label="$t('patients.sharing.removeAction')"
                      @click="handleRemovePatientUser(user.id)"
                    />
                  </div>
                </div>
              </q-card>
            </div>

            <q-card
              v-else
              flat
              class="patient-overview-page__condition-empty"
            >
              <p class="patient-overview-page__summary-eyebrow">
                {{ $t("patients.sharing.emptyEyebrow") }}
              </p>
              <h3 class="patient-overview-page__condition-empty-title">
                {{ $t("patients.sharing.emptyTitle") }}
              </h3>
              <p class="patient-overview-page__summary-copy">
                {{ $t("patients.sharing.emptyDescription") }}
              </p>
            </q-card>
          </q-card-section>
        </q-card>

        <q-card
          flat
          class="patient-overview-page__summary"
        >
          <q-card-section class="patient-overview-page__section-header">
            <div>
              <p class="patient-overview-page__summary-eyebrow">
                {{ $t("patients.summaryEyebrow") }}
              </p>
              <h2 class="patient-overview-page__summary-title">
                {{ $t("patients.summaryTitle") }}
              </h2>
              <p class="patient-overview-page__summary-copy">
                {{ $t("patients.summaryDescription") }}
              </p>
            </div>

            <div class="patient-overview-page__section-actions">
              <q-btn
                v-for="action in overviewQuickActions"
                :key="action.label"
                color="primary"
                outline
                no-caps
                :icon="action.icon"
                :label="action.label"
                @click="action.onClick"
              />
            </div>
          </q-card-section>

          <q-card-section class="patient-overview-page__overview-grid">
            <q-card
              v-for="metric in overviewMetricCards"
              :key="metric.eyebrow"
              flat
              :class="[
                'patient-overview-page__overview-card',
                metric.toneClass,
              ]"
            >
              <div class="patient-overview-page__overview-card-header">
                <p class="patient-overview-page__overview-card-eyebrow">
                  {{ metric.eyebrow }}
                </p>
                <q-icon
                  :name="metric.icon"
                  size="1.2rem"
                />
              </div>
              <p class="patient-overview-page__overview-card-value">
                {{ metric.count }}
              </p>
              <p class="patient-overview-page__overview-card-copy">
                {{ metric.description }}
              </p>
            </q-card>
          </q-card-section>

          <q-card-section class="patient-overview-page__overview-feed">
            <div class="patient-overview-page__overview-stream">
              <div class="patient-overview-page__overview-stream-header">
                <p class="patient-overview-page__summary-eyebrow">
                  {{ $t("patients.overviewFeed.upcomingAppointments.eyebrow") }}
                </p>
                <q-badge
                  rounded
                  color="primary"
                  text-color="white"
                  :label="overview?.upcomingAppointments.length ?? 0"
                />
              </div>

              <div
                v-if="overview?.upcomingAppointments.length"
                class="patient-overview-page__overview-stream-list"
              >
                <div
                  v-for="appointment in overview.upcomingAppointments"
                  :key="appointment.id"
                  class="patient-overview-page__overview-stream-item"
                >
                  <p class="patient-overview-page__overview-stream-title">Booking</p>
                  <p class="patient-overview-page__overview-stream-copy">
                    {{ formatOverviewAppointmentMeta(appointment) }}
                  </p>
                </div>
              </div>
              <p
                v-else
                class="patient-overview-page__overview-stream-empty"
              >
                {{ $t("patients.overviewFeed.upcomingAppointments.empty") }}
              </p>
            </div>

            <div class="patient-overview-page__overview-stream">
              <div class="patient-overview-page__overview-stream-header">
                <p class="patient-overview-page__summary-eyebrow">
                  {{ $t("patients.overviewFeed.pendingPrescriptions.eyebrow") }}
                </p>
                <q-badge
                  rounded
                  color="secondary"
                  text-color="white"
                  :label="overview?.pendingPrescriptions.length ?? 0"
                />
              </div>

              <div
                v-if="overview?.pendingPrescriptions.length"
                class="patient-overview-page__overview-stream-list"
              >
                <div
                  v-for="prescription in overview.pendingPrescriptions"
                  :key="prescription.id"
                  class="patient-overview-page__overview-stream-item"
                >
                  <p class="patient-overview-page__overview-stream-title">
                    {{ $t(`prescriptions.types.${prescription.prescriptionType}`) }}
                  </p>
                  <p class="patient-overview-page__overview-stream-copy">
                    {{ formatOverviewPrescriptionMeta(prescription) }}
                  </p>
                </div>
              </div>
              <p
                v-else
                class="patient-overview-page__overview-stream-empty"
              >
                {{ $t("patients.overviewFeed.pendingPrescriptions.empty") }}
              </p>
            </div>

            <div class="patient-overview-page__overview-stream">
              <div class="patient-overview-page__overview-stream-header">
                <p class="patient-overview-page__summary-eyebrow">
                  {{ $t("patients.overviewFeed.activeConditions.eyebrow") }}
                </p>
                <q-badge
                  rounded
                  color="positive"
                  text-color="white"
                  :label="overview?.activeConditions.length ?? 0"
                />
              </div>

              <div
                v-if="overview?.activeConditions.length"
                class="patient-overview-page__overview-stream-list"
              >
                <div
                  v-for="condition in overview.activeConditions"
                  :key="condition.id"
                  class="patient-overview-page__overview-stream-item"
                >
                  <p class="patient-overview-page__overview-stream-title">
                    {{ condition.name }}
                  </p>
                  <p class="patient-overview-page__overview-stream-copy">
                    {{ condition.notes || $t("conditions.emptyNotes") }}
                  </p>
                </div>
              </div>
              <p
                v-else
                class="patient-overview-page__overview-stream-empty"
              >
                {{ $t("patients.overviewFeed.activeConditions.empty") }}
              </p>
            </div>

            <div class="patient-overview-page__overview-stream">
              <div class="patient-overview-page__overview-stream-header">
                <p class="patient-overview-page__summary-eyebrow">
                  {{ $t("patients.overviewFeed.activeMedications.eyebrow") }}
                </p>
                <div class="patient-overview-page__overview-stream-actions">
                  <q-badge
                    rounded
                    color="accent"
                    text-color="white"
                    :label="overview?.activeMedications.length ?? 0"
                  />
                  <q-btn
                    flat
                    dense
                    color="primary"
                    icon="arrow_downward"
                    no-caps
                    :label="$t('patients.overviewFeed.activeMedications.openAction')"
                    @click="scrollToMedicationsSection"
                  />
                </div>
              </div>

              <div
                v-if="overview?.activeMedications.length"
                class="patient-overview-page__overview-stream-list"
              >
                <div
                  v-for="medication in overview.activeMedications"
                  :key="medication.id"
                  class="patient-overview-page__overview-stream-item"
                >
                  <p class="patient-overview-page__overview-stream-title">
                    {{ medication.name }}
                  </p>
                  <p class="patient-overview-page__overview-stream-copy">
                    {{ formatOverviewMedicationMeta(medication) }}
                  </p>
                </div>
              </div>
              <p
                v-else
                class="patient-overview-page__overview-stream-empty"
              >
                {{ $t("patients.overviewFeed.activeMedications.empty") }}
              </p>
            </div>
          </q-card-section>
        </q-card>

        <q-card
          id="patient-medications-section"
          flat
          class="patient-overview-page__medications"
        >
          <q-card-section class="patient-overview-page__section-header">
            <div>
              <p class="patient-overview-page__summary-eyebrow">
                {{ $t("medications.eyebrow") }}
              </p>
              <h2 class="patient-overview-page__summary-title">
                {{ $t("medications.title") }}
              </h2>
              <p class="patient-overview-page__summary-copy">
                {{ $t("medications.description") }}
              </p>
            </div>

            <div class="patient-overview-page__section-actions">
              <q-btn
                color="primary"
                icon="add"
                unelevated
                no-caps
                :label="$t('medications.createAction')"
                @click="openCreateMedicationDialog"
              />
            </div>
          </q-card-section>

          <q-card-section>
            <div
              v-if="medications.length"
              class="patient-overview-page__medication-list"
            >
              <q-card
                v-for="medication in medications"
                :key="medication.id"
                flat
                class="patient-overview-page__medication-card"
              >
                <div class="patient-overview-page__medication-head">
                  <div class="patient-overview-page__medication-main">
                    <div class="patient-overview-page__medication-title-row">
                      <h3 class="patient-overview-page__medication-title">
                        {{ medication.name }}
                      </h3>
                      <q-badge
                        rounded
                        color="accent"
                        text-color="white"
                        :label="$t('medications.activeBadge')"
                      />
                    </div>
                    <p class="patient-overview-page__medication-copy">
                      {{ medication.notes || $t("medications.emptyNotes") }}
                    </p>
                    <div class="patient-overview-page__medication-meta-grid">
                      <p class="patient-overview-page__medication-meta">
                        <span>{{ $t("medications.fields.dosage") }}</span>
                        {{ medication.dosage }}
                      </p>
                      <p class="patient-overview-page__medication-meta">
                        <span>{{ $t("medications.fields.quantity") }}</span>
                        {{ medication.quantity }}
                      </p>
                      <p class="patient-overview-page__medication-meta">
                        <span>{{ $t("medications.fields.nextGpContactDate") }}</span>
                        {{ formatMedicationDate(medication.nextGpContactDate) }}
                      </p>
                      <p class="patient-overview-page__medication-meta">
                        <span>{{ $t("medications.fields.renewalCadence") }}</span>
                        {{ medication.renewalCadence || $t("medications.emptyCadence") }}
                      </p>
                      <p class="patient-overview-page__medication-meta">
                        <span>{{ $t("medications.fields.prescribingDoctor") }}</span>
                        {{
                          medication.prescribingDoctor ||
                          $t("medications.emptyPrescribingDoctor")
                        }}
                      </p>
                      <p class="patient-overview-page__medication-meta">
                        <span>{{ $t("medications.fields.condition") }}</span>
                        {{ resolveMedicationConditionLabel(medication.conditionId) }}
                      </p>
                    </div>

                    <div class="patient-overview-page__medication-links">
                      <p class="patient-overview-page__medication-links-label">
                        {{ $t("medications.linkedPrescriptionsLabel") }}
                      </p>
                      <div
                        v-if="medication.linkedPrescriptions.length"
                        class="patient-overview-page__medication-links-list"
                      >
                        <q-chip
                          v-for="prescription in medication.linkedPrescriptions"
                          :key="prescription.id"
                          outline
                          color="secondary"
                          text-color="secondary"
                          icon="description"
                        >
                          {{ resolveMedicationLinkedPrescriptionLabel(prescription) }}
                        </q-chip>
                      </div>
                      <p
                        v-else
                        class="patient-overview-page__medication-link-empty"
                      >
                        {{ $t("medications.emptyLinkedPrescriptions") }}
                      </p>
                    </div>
                  </div>

                  <div class="patient-overview-page__medication-actions">
                    <q-btn
                      flat
                      color="primary"
                      icon="edit"
                      no-caps
                      :label="$t('medications.edit')"
                      @click="openEditMedicationDialog(medication)"
                    />
                    <q-btn
                      flat
                      color="warning"
                      icon="archive"
                      no-caps
                      :loading="isMedicationSaving"
                      :label="$t('medications.archiveAction')"
                      @click="handleMedicationArchive(medication.id)"
                    />
                  </div>
                </div>
              </q-card>
            </div>

            <q-card
              v-else
              flat
              class="patient-overview-page__medication-empty"
            >
              <p class="patient-overview-page__summary-eyebrow">
                {{ $t("medications.emptyEyebrow") }}
              </p>
              <h3 class="patient-overview-page__prescription-empty-title">
                {{ $t("medications.emptyTitle") }}
              </h3>
              <p class="patient-overview-page__summary-copy">
                {{ $t("medications.emptyDescription") }}
              </p>
            </q-card>
          </q-card-section>
        </q-card>

        <q-card
          flat
          class="patient-overview-page__prescriptions"
        >
          <q-card-section class="patient-overview-page__section-header">
            <div>
              <p class="patient-overview-page__summary-eyebrow">
                {{ $t("prescriptions.eyebrow") }}
              </p>
              <h2 class="patient-overview-page__summary-title">
                {{ $t("prescriptions.title") }}
              </h2>
              <p class="patient-overview-page__summary-copy">
                {{ $t("prescriptions.description") }}
              </p>
            </div>

            <div class="patient-overview-page__section-actions">
              <q-btn
                color="primary"
                icon="add"
                unelevated
                no-caps
                :label="$t('prescriptions.createAction')"
                @click="openCreatePrescriptionDialog"
              />
            </div>
          </q-card-section>

          <q-card-section>
            <div
              v-if="prescriptions.length"
              class="patient-overview-page__prescription-list"
            >
              <q-card
                v-for="prescription in prescriptions"
                :key="prescription.id"
                flat
                class="patient-overview-page__prescription-card"
              >
                <div class="patient-overview-page__prescription-head">
                  <div class="patient-overview-page__prescription-main">
                    <div class="patient-overview-page__prescription-title-row">
                      <h3 class="patient-overview-page__prescription-title">
                        {{ resolvePrescriptionTypeLabel(prescription) }}
                      </h3>
                      <q-badge
                        rounded
                        color="secondary"
                        text-color="white"
                        :label="$t(`prescriptions.statuses.${prescription.status}`)"
                      />
                    </div>
                    <p class="patient-overview-page__prescription-copy">
                      {{ prescription.notes || $t("prescriptions.emptyNotes") }}
                    </p>
                    <div class="patient-overview-page__prescription-meta-grid">
                      <p class="patient-overview-page__prescription-meta">
                        <span>{{ $t("prescriptions.fields.issueDate") }}</span>
                        {{ formatPrescriptionDate(prescription.issueDate) }}
                      </p>
                      <p class="patient-overview-page__prescription-meta">
                        <span>{{ $t("prescriptions.fields.expirationDate") }}</span>
                        {{ formatPrescriptionDate(prescription.expirationDate) }}
                      </p>
                      <p class="patient-overview-page__prescription-meta">
                        <span>{{ $t("prescriptions.fields.requestedAt") }}</span>
                        {{ formatPrescriptionDateTime(prescription.requestedAt) }}
                      </p>
                      <p class="patient-overview-page__prescription-meta">
                        <span>{{ $t("prescriptions.fields.receivedAt") }}</span>
                        {{ formatPrescriptionDateTime(prescription.receivedAt) }}
                      </p>
                      <p class="patient-overview-page__prescription-meta">
                        <span>{{ $t("prescriptions.fields.collectedAt") }}</span>
                        {{ formatPrescriptionDateTime(prescription.collectedAt) }}
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

                  <div class="patient-overview-page__prescription-actions">
                                        <q-btn
                      :key="`advance-${prescription.id}-${prescription.status}`"
                      v-if="nextPrescriptionStatus(prescription.status)"
                      flat
                      color="secondary"
                      icon="progression"
                      no-caps
                      :loading="isPrescriptionSaving"
                      :label="
                        $t('prescriptions.advanceAction', {
                          status: $t(
                            `prescriptions.statuses.${nextPrescriptionStatus(prescription.status)}`,
                          ),
                        })
                      "
                      @click="
                        handleAdvancePrescriptionStatus(
                          prescription.id,
                          nextPrescriptionStatus(prescription.status) as PrescriptionStatus,
                        )
                      "
                    />
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
              class="patient-overview-page__prescription-empty"
            >
              <p class="patient-overview-page__summary-eyebrow">
                {{ $t("prescriptions.emptyEyebrow") }}
              </p>
              <h3 class="patient-overview-page__prescription-empty-title">
                {{ $t("prescriptions.emptyTitle") }}
              </h3>
              <p class="patient-overview-page__summary-copy">
                {{ $t("prescriptions.emptyDescription") }}
              </p>
            </q-card>
          </q-card-section>
        </q-card>

        <q-card
          flat
          class="patient-overview-page__bookings"
        >
          <q-card-section class="patient-overview-page__section-header">
            <div>
              <p class="patient-overview-page__summary-eyebrow">
                {{ $t("bookings.eyebrow") }}
              </p>
              <h2 class="patient-overview-page__summary-title">
                {{ $t("bookings.title") }}
              </h2>
              <p class="patient-overview-page__summary-copy">
                {{ $t("bookings.description") }}
              </p>
            </div>

            <div class="patient-overview-page__section-actions">
              <q-btn
                color="primary"
                icon="add"
                unelevated
                no-caps
                :label="$t('bookings.createAction')"
                @click="openCreateBookingDialog"
              />
            </div>
          </q-card-section>

          <q-card-section>
            <div
              v-if="bookings.length"
              class="patient-overview-page__booking-list"
            >
              <div class="patient-overview-page__booking-summary-row">
                <q-badge
                  rounded
                  color="primary"
                  text-color="white"
                  :label="
                    $t('bookings.upcomingCount', {
                      count: upcomingBookings.length,
                    })
                  "
                />
              </div>

              <q-card
                v-for="booking in bookings"
                :key="booking.id"
                :id="`booking-${booking.id}`"
                flat
                class="patient-overview-page__booking-card"
                :class="{
                  'patient-overview-page__booking-card--upcoming':
                    booking.appointmentAt && booking.appointmentAt >= nowDateTime,
                }"
              >
                <div class="patient-overview-page__booking-head">
                  <div class="patient-overview-page__booking-main">
                    <div class="patient-overview-page__booking-title-row">
                      <h3 class="patient-overview-page__booking-title">Booking</h3>
                      <q-badge
                        rounded
                        color="accent"
                        text-color="white"
                        :label="$t(`bookings.statuses.${booking.status}`)"
                      />
                    </div>
                    <p class="patient-overview-page__booking-copy">
                      {{ booking.notes || $t("bookings.emptyNotes") }}
                    </p>
                    <div class="patient-overview-page__booking-meta-grid">
                      <p class="patient-overview-page__booking-meta">
                        <span>{{ $t("bookings.fields.appointmentAt") }}</span>
                        {{ formatBookingDateTime(booking.appointmentAt) }}
                      </p>
                      <p class="patient-overview-page__booking-meta">
                        <span>{{ $t("bookings.fields.bookedAt") }}</span>
                        {{ formatBookingDateTime(booking.bookedAt) }}
                      </p>
                      <p class="patient-overview-page__booking-meta">
                        <span>{{ $t("bookings.fields.facility") }}</span>
                        {{ resolveBookingFacilityLabel(booking.facilityId) }}
                      </p>
                      <p class="patient-overview-page__booking-meta">
                        <span>{{ $t("bookings.fields.prescription") }}</span>
                        {{ resolveBookingPrescriptionLabel(booking.prescriptionId) }}
                      </p>
                    </div>

                    <RelatedDocumentsPanel
                      :documents="getBookingDocuments(booking.id)"
                      :empty-description="$t('bookings.linkedDocumentsEmptyDescription')"
                      :empty-title="$t('bookings.linkedDocumentsEmptyTitle')"
                      :eyebrow="$t('bookings.linkedDocumentsEyebrow')"
                      :title="$t('bookings.linkedDocumentsTitle')"
                    />
                  </div>

                  <div class="patient-overview-page__booking-actions">
                    <q-btn
                      :key="`advance-booking-${booking.id}-${booking.status}`"
                      v-if="nextBookingStatus(booking.status)"
                      flat
                      color="accent"
                      icon="event_available"
                      no-caps
                      :loading="isBookingSaving"
                      :label="
                        $t('bookings.advanceAction', {
                          status: $t(
                            `bookings.statuses.${nextBookingStatus(booking.status)}`,
                          ),
                        })
                      "
                      @click="
                        handleAdvanceBookingStatus(
                          booking.id,
                          nextBookingStatus(booking.status) as BookingStatus,
                        )
                      "
                    />
                    <q-btn
                      :key="`edit-booking-${booking.id}`"
                      flat
                      color="primary"
                      icon="edit"
                      no-caps
                      :label="$t('bookings.edit')"
                      @click="openEditBookingDialog(booking)"
                    />
                  </div>
                </div>
              </q-card>
            </div>

            <q-card
              v-else
              flat
              class="patient-overview-page__booking-empty"
            >
              <p class="patient-overview-page__summary-eyebrow">
                {{ $t("bookings.emptyEyebrow") }}
              </p>
              <h3 class="patient-overview-page__prescription-empty-title">
                {{ $t("bookings.emptyTitle") }}
              </h3>
              <p class="patient-overview-page__summary-copy">
                {{ $t("bookings.emptyDescription") }}
              </p>
            </q-card>
          </q-card-section>
        </q-card>

        <q-card
          flat
          class="patient-overview-page__conditions"
        >
          <q-card-section class="patient-overview-page__section-header">
            <div>
              <p class="patient-overview-page__summary-eyebrow">
                {{ $t("conditions.eyebrow") }}
              </p>
              <h2 class="patient-overview-page__summary-title">
                {{ $t("conditions.title") }}
              </h2>
              <p class="patient-overview-page__summary-copy">
                {{ $t("conditions.description") }}
              </p>
            </div>

            <div class="patient-overview-page__section-actions">
              <q-toggle
                v-model="showInactiveConditions"
                checked-icon="visibility"
                color="primary"
                keep-color
                unchecked-icon="visibility_off"
                :label="$t('conditions.showInactive')"
              />
              <q-btn
                color="primary"
                icon="add"
                unelevated
                no-caps
                :label="$t('conditions.createAction')"
                @click="openCreateConditionDialog"
              />
            </div>
          </q-card-section>

          <q-card-section>
            <div
              v-if="conditions.length"
              class="patient-overview-page__condition-list"
            >
              <q-card
                v-for="condition in conditions"
                :key="condition.id"
                flat
                class="patient-overview-page__condition-card"
                :class="{
                  'patient-overview-page__condition-card--inactive': !condition.active,
                }"
              >
                <div class="patient-overview-page__condition-head">
                  <div>
                    <div class="patient-overview-page__condition-title-row">
                      <h3 class="patient-overview-page__condition-title">
                        {{ condition.name }}
                      </h3>
                      <q-badge
                        rounded
                        :color="condition.active ? 'positive' : 'grey-6'"
                        text-color="white"
                        :label="
                          condition.active
                            ? $t('conditions.activeBadge')
                            : $t('conditions.inactiveBadge')
                        "
                      />
                    </div>
                    <p class="patient-overview-page__condition-copy">
                      {{ condition.notes || $t("conditions.emptyNotes") }}
                    </p>
                  </div>

                  <div class="patient-overview-page__condition-actions">
                    <q-btn
                      flat
                      color="primary"
                      icon="edit"
                      no-caps
                      :label="$t('conditions.edit')"
                      @click="openEditConditionDialog(condition)"
                    />
                    <q-btn
                      v-if="condition.active"
                      flat
                      color="warning"
                      icon="pause_circle"
                      no-caps
                      :loading="isConditionSaving"
                      :label="$t('conditions.deactivateAction')"
                      @click="handleDeactivateCondition(condition.id)"
                    />
                  </div>
                </div>
              </q-card>
            </div>

            <q-card
              v-else
              flat
              class="patient-overview-page__condition-empty"
            >
              <p class="patient-overview-page__summary-eyebrow">
                {{ $t("conditions.emptyEyebrow") }}
              </p>
              <h3 class="patient-overview-page__condition-empty-title">
                {{
                  showInactiveConditions || !hasInactiveConditions
                    ? $t("conditions.emptyTitle")
                    : $t("conditions.emptyActiveTitle")
                }}
              </h3>
              <p class="patient-overview-page__summary-copy">
                {{
                  showInactiveConditions || !hasInactiveConditions
                    ? $t("conditions.emptyDescription")
                    : $t("conditions.emptyActiveDescription")
                }}
              </p>
            </q-card>
          </q-card-section>
        </q-card>
      </q-card-section>
    </q-card>

    <PatientFormDialog
      v-model="isPatientFormOpen"
      :loading="isPatientSaving"
      :patient="patient as PatientRecord | null"
      :submit-label="$t('patients.save')"
      :title="$t('patients.editTitle')"
      @submit="handleUpdate"
    />

    <MedicationFormDialog
      :condition-options="medicationConditionOptions"
      :loading="isMedicationSaving"
      :medication="editingMedication"
      :model-value="isMedicationFormOpen"
      :submit-label="$t('medications.save')"
      :title="editingMedication ? $t('medications.editTitle') : $t('medications.createTitle')"
      @submit="handleMedicationSubmit"
      @update:model-value="handleMedicationDialogModelChange"
    />

    <ConditionFormDialog
      :condition="editingCondition"
      :loading="isConditionSaving"
      :model-value="isConditionFormOpen"
      :submit-label="$t('conditions.save')"
      :title="
        editingCondition ? $t('conditions.editTitle') : $t('conditions.createTitle')
      "
      @submit="handleConditionSubmit"
      @update:model-value="handleConditionDialogModelChange"
    />

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

    <BookingFormDialog
      :booking="editingBooking"
      :facility-options="facilityOptions"
      :loading="isBookingSaving"
      :model-value="isBookingFormOpen"
      :prescription-options="bookingPrescriptionOptions"
      :submit-label="$t('bookings.save')"
            :title="editingBooking ? $t('bookings.editTitle') : $t('bookings.createTitle')"
      @submit="handleBookingSubmit"
      @update:model-value="handleBookingDialogModelChange"
    />
  </q-page>
</template>

<style scoped>
.patient-overview-page {
  display: grid;
  gap: 1rem;
}

.patient-overview-page__banner {
  background: rgba(183, 80, 63, 0.14);
  color: #7f2e22;
}

.patient-overview-page__hero {
  border-radius: 1.5rem;
  background:
    linear-gradient(135deg, rgba(20, 50, 63, 0.04), transparent 40%),
    rgba(255, 255, 255, 0.94);
}

.patient-overview-page__loading {
  display: flex;
  justify-content: center;
  padding: 3rem;
}

.patient-overview-page__header {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 1rem;
}

.patient-overview-page__eyebrow,
.patient-overview-page__summary-eyebrow,
.patient-overview-page__meta-label {
  margin: 0 0 0.4rem;
}

.patient-overview-page__eyebrow,
.patient-overview-page__summary-eyebrow,
.patient-overview-page__meta-label {
  color: #6c8f7d;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.patient-overview-page__title-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.patient-overview-page__title,
.patient-overview-page__summary-title,
.patient-overview-page__condition-empty-title {
  margin: 0;
  color: #14323f;
  font-family: "Newsreader", serif;
}

.patient-overview-page__title {
  font-size: clamp(2rem, 4vw, 3rem);
}

.patient-overview-page__summary-title {
  font-size: 1.75rem;
}

.patient-overview-page__condition-empty-title {
  font-size: 1.5rem;
}

.patient-overview-page__actions,
.patient-overview-page__condition-actions,
.patient-overview-page__medication-actions,
.patient-overview-page__section-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.patient-overview-page__actions {
  justify-content: end;
}

.patient-overview-page__meta {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
  margin-top: 1.5rem;
}

.patient-overview-page__meta-card,
.patient-overview-page__summary,
.patient-overview-page__sharing,
.patient-overview-page__medications,
.patient-overview-page__prescriptions,
.patient-overview-page__tasks,
.patient-overview-page__bookings,
.patient-overview-page__conditions,
.patient-overview-page__condition-card,
.patient-overview-page__condition-empty,
.patient-overview-page__prescription-card,
.patient-overview-page__prescription-empty,
.patient-overview-page__booking-card,
.patient-overview-page__booking-empty,
.patient-overview-page__task-card,
.patient-overview-page__task-empty {
  border-radius: 1.25rem;
  background: rgba(244, 246, 243, 0.9);
}

.patient-overview-page__meta-card {
  padding: 1rem 1.1rem;
}

.patient-overview-page__meta-value,
.patient-overview-page__summary-copy,
.patient-overview-page__condition-copy {
  margin: 0;
  color: #32505d;
  line-height: 1.6;
}

.patient-overview-page__notes {
  white-space: pre-wrap;
}

.patient-overview-page__summary,
.patient-overview-page__sharing,
.patient-overview-page__medications,
.patient-overview-page__prescriptions,
.patient-overview-page__tasks,
.patient-overview-page__bookings,
.patient-overview-page__conditions {
  margin-top: 1rem;
}

.patient-overview-page__section-header {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 1rem;
}

.patient-overview-page__sharing-form {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
}

.patient-overview-page__sharing-input {
  min-width: min(24rem, 100%);
}

.patient-overview-page__sharing-list {
  display: grid;
  gap: 0.9rem;
}

.patient-overview-page__sharing-card {
  padding: 1rem 1.1rem;
  border: 1px solid rgba(20, 50, 63, 0.06);
  border-radius: 1.25rem;
  background: rgba(244, 246, 243, 0.9);
}

.patient-overview-page__sharing-head {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 1rem;
}

.patient-overview-page__sharing-main {
  display: grid;
  gap: 0.45rem;
}

.patient-overview-page__sharing-title-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
}

.patient-overview-page__sharing-copy,
.patient-overview-page__sharing-meta {
  margin: 0;
  color: #32505d;
  line-height: 1.6;
}

.patient-overview-page__sharing-meta span {
  display: block;
  color: #6c8f7d;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.patient-overview-page__overview-grid,
.patient-overview-page__overview-feed {
  display: grid;
  gap: 1rem;
}

.patient-overview-page__overview-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.patient-overview-page__overview-feed {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  padding-top: 0;
}

.patient-overview-page__overview-card,
.patient-overview-page__overview-stream {
  border-radius: 1.1rem;
  border: 1px solid rgba(20, 50, 63, 0.07);
  padding: 1rem 1.1rem;
}

.patient-overview-page__overview-card--urgent {
  background: rgba(255, 239, 233, 0.96);
}

.patient-overview-page__overview-card--info {
  background: rgba(232, 244, 249, 0.96);
}

.patient-overview-page__overview-card--accent {
  background: rgba(241, 236, 247, 0.96);
}

.patient-overview-page__overview-card--calm {
  background: rgba(232, 243, 235, 0.96);
}

.patient-overview-page__overview-card-header,
.patient-overview-page__overview-stream-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.patient-overview-page__overview-stream-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 0.5rem;
}

.patient-overview-page__overview-card-eyebrow {
  margin: 0;
  color: #6c8f7d;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.patient-overview-page__overview-card-value,
.patient-overview-page__overview-stream-title {
  margin: 0;
  color: #14323f;
  font-weight: 700;
}

.patient-overview-page__overview-card-value {
  font-size: 2rem;
  line-height: 1.1;
  margin-top: 0.85rem;
}

.patient-overview-page__overview-card-copy,
.patient-overview-page__overview-stream-copy,
.patient-overview-page__overview-stream-empty {
  margin: 0;
  color: #32505d;
  line-height: 1.6;
}

.patient-overview-page__overview-card-copy {
  margin-top: 0.55rem;
}

.patient-overview-page__overview-stream-list {
  display: grid;
  gap: 0.85rem;
  margin-top: 1rem;
}

.patient-overview-page__overview-stream-item {
  display: grid;
  gap: 0.3rem;
}

.patient-overview-page__overview-stream-empty {
  margin-top: 1rem;
}

.patient-overview-page__prescription-list,
.patient-overview-page__medication-list,
.patient-overview-page__booking-list,
.patient-overview-page__condition-list,
.patient-overview-page__task-list,
.patient-overview-page__task-sections {
  display: grid;
  gap: 0.9rem;
}

.patient-overview-page__prescription-card,
.patient-overview-page__medication-card,
.patient-overview-page__booking-card,
.patient-overview-page__condition-card,
.patient-overview-page__task-card {
  padding: 1rem 1.1rem;
  border: 1px solid rgba(20, 50, 63, 0.06);
}

.patient-overview-page__booking-card--upcoming {
  background: rgba(232, 244, 249, 0.96);
  border-color: rgba(40, 83, 107, 0.16);
}

.patient-overview-page__task-card--overdue {
  background: rgba(255, 239, 233, 0.96);
  border-color: rgba(183, 80, 63, 0.18);
}

.patient-overview-page__task-card--blocked {
  background: rgba(255, 245, 218, 0.95);
  border-color: rgba(168, 114, 33, 0.2);
}

.patient-overview-page__task-card--completed {
  background: rgba(232, 243, 235, 0.94);
  border-color: rgba(69, 121, 84, 0.16);
}

.patient-overview-page__condition-card--inactive {
  background: rgba(229, 233, 229, 0.96);
  border-color: rgba(20, 50, 63, 0.1);
}

.patient-overview-page__prescription-head,
.patient-overview-page__medication-head,
.patient-overview-page__booking-head,
.patient-overview-page__condition-head,
.patient-overview-page__task-head {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 1rem;
}

.patient-overview-page__prescription-title-row,
.patient-overview-page__medication-title-row,
.patient-overview-page__booking-title-row,
.patient-overview-page__condition-title-row,
.patient-overview-page__task-title-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}

.patient-overview-page__prescription-title,
.patient-overview-page__medication-title,
.patient-overview-page__booking-title,
.patient-overview-page__condition-title,
.patient-overview-page__task-title,
.patient-overview-page__task-group-title {
  margin: 0;
  color: #14323f;
  font-weight: 700;
}

.patient-overview-page__prescription-title,
.patient-overview-page__medication-title,
.patient-overview-page__booking-title,
.patient-overview-page__condition-title,
.patient-overview-page__task-title {
  font-size: 1.1rem;
}

.patient-overview-page__prescription-main,
.patient-overview-page__medication-main,
.patient-overview-page__booking-main {
  display: grid;
  gap: 0.65rem;
}

.patient-overview-page__prescription-copy,
.patient-overview-page__medication-copy,
.patient-overview-page__prescription-meta,
.patient-overview-page__medication-meta,
.patient-overview-page__booking-copy,
.patient-overview-page__booking-meta {
  margin: 0;
  color: #32505d;
  line-height: 1.6;
}

.patient-overview-page__prescription-meta-grid,
.patient-overview-page__medication-meta-grid,
.patient-overview-page__booking-meta-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.65rem 1rem;
}

.patient-overview-page__prescription-meta span,
.patient-overview-page__medication-meta span,
.patient-overview-page__booking-meta span {
  display: block;
  color: #6c8f7d;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.patient-overview-page__medication-links {
  display: grid;
  gap: 0.55rem;
}

.patient-overview-page__medication-links-label,
.patient-overview-page__medication-link-empty {
  margin: 0;
  color: #32505d;
  line-height: 1.6;
}

.patient-overview-page__medication-links-label {
  color: #6c8f7d;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.patient-overview-page__medication-links-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.patient-overview-page__booking-summary-row {
  display: flex;
  justify-content: flex-start;
}

.patient-overview-page__task-group-title {
  font-size: 1rem;
}

.patient-overview-page__task-group {
  display: grid;
  gap: 0.75rem;
}

.patient-overview-page__task-group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.patient-overview-page__task-main {
  display: grid;
  gap: 0.5rem;
}

.patient-overview-page__task-type,
.patient-overview-page__task-copy,
.patient-overview-page__task-meta,
.patient-overview-page__task-blocked-copy {
  margin: 0;
}

.patient-overview-page__task-type {
  color: #28536b;
  font-size: 0.95rem;
  font-weight: 700;
}

.patient-overview-page__task-copy,
.patient-overview-page__task-meta {
  color: #32505d;
  line-height: 1.6;
}

.patient-overview-page__task-meta-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.65rem 1rem;
}

.patient-overview-page__task-meta span {
  display: block;
  color: #6c8f7d;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.patient-overview-page__task-blocked-copy {
  color: #8a5a17;
  font-weight: 700;
}

.patient-overview-page__prescription-empty,
.patient-overview-page__medication-empty,
.patient-overview-page__booking-empty,
.patient-overview-page__condition-empty,
.patient-overview-page__task-empty {
  padding: 1.25rem;
}

.patient-overview-page__prescription-empty-title {
  margin: 0;
  color: #14323f;
  font-family: "Newsreader", serif;
  font-size: 1.5rem;
}

@media (max-width: 900px) {
  .patient-overview-page__overview-grid,
  .patient-overview-page__overview-feed {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 800px) {
.patient-overview-page__header,
.patient-overview-page__section-header,
.patient-overview-page__sharing-head,
.patient-overview-page__prescription-head,
.patient-overview-page__medication-head,
.patient-overview-page__booking-head,
.patient-overview-page__condition-head,
.patient-overview-page__task-head {
    flex-direction: column;
  }

  .patient-overview-page__actions {
    justify-content: start;
  }

  .patient-overview-page__meta,
  .patient-overview-page__overview-grid,
  .patient-overview-page__overview-feed,
  .patient-overview-page__prescription-meta-grid,
  .patient-overview-page__medication-meta-grid,
  .patient-overview-page__booking-meta-grid,
  .patient-overview-page__task-meta-grid {
    grid-template-columns: 1fr;
  }
}
</style>
