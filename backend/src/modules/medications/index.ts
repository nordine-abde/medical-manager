import { Elysia, t } from "elysia";

import type { auth } from "../../auth";
import { requireRequestSession } from "../../auth/session";
import {
  createMedicationsService,
  MedicationAccessError,
  type MedicationWithContext,
  PatientMedicationAccessError,
} from "./service";

const dateOnlySchema = t.String({
  pattern: "^\\d{4}-\\d{2}-\\d{2}$",
});

const patientIdParamsSchema = t.Object({
  patientId: t.String({
    format: "uuid",
  }),
});

const medicationIdParamsSchema = t.Object({
  medicationId: t.String({
    format: "uuid",
  }),
});

const medicationBodySchema = t.Object({
  conditionId: t.Optional(
    t.Nullable(
      t.String({
        format: "uuid",
      }),
    ),
  ),
  dosage: t.String({
    minLength: 1,
  }),
  name: t.String({
    minLength: 1,
  }),
  nextGpContactDate: t.Optional(t.Nullable(dateOnlySchema)),
  notes: t.Optional(t.Nullable(t.String())),
  prescribingDoctor: t.Optional(t.Nullable(t.String())),
  quantity: t.String({
    minLength: 1,
  }),
  renewalCadence: t.Optional(t.Nullable(t.String())),
});

const medicationUpdateBodySchema = t.Object({
  conditionId: t.Optional(
    t.Nullable(
      t.String({
        format: "uuid",
      }),
    ),
  ),
  dosage: t.Optional(
    t.String({
      minLength: 1,
    }),
  ),
  name: t.Optional(
    t.String({
      minLength: 1,
    }),
  ),
  nextGpContactDate: t.Optional(t.Nullable(dateOnlySchema)),
  notes: t.Optional(t.Nullable(t.String())),
  prescribingDoctor: t.Optional(t.Nullable(t.String())),
  quantity: t.Optional(
    t.String({
      minLength: 1,
    }),
  ),
  renewalCadence: t.Optional(t.Nullable(t.String())),
});

const medicationListQuerySchema = t.Object({
  includeArchived: t.Optional(t.Union([t.Literal("true"), t.Literal("false")])),
});

const unauthorizedPayload = {
  error: "unauthorized",
  message: "Authentication required.",
} as const;

const patientNotFoundPayload = {
  error: "patient_not_found",
  message: "Patient not found.",
} as const;

const medicationNotFoundPayload = {
  error: "medication_not_found",
  message: "Medication not found.",
} as const;

const formatDateOnly = (value: Date | string | null): string | null => {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    return value.slice(0, 10);
  }

  return value.toISOString().slice(0, 10);
};

const formatDateTime = (value: Date | null): string | null =>
  value?.toISOString() ?? null;

const normalizeOptionalText = (
  value?: string | null,
): string | null | undefined => {
  if (value === undefined) {
    return undefined;
  }

  return value?.trim() || null;
};

const mapMedication = ({
  linkedPrescriptions,
  medication,
  renewalTasks,
}: MedicationWithContext) => ({
  archived: medication.deleted_at !== null,
  conditionId: medication.condition_id,
  createdAt: medication.created_at.toISOString(),
  deletedAt: formatDateTime(medication.deleted_at),
  dosage: medication.dosage,
  id: medication.id,
  linkedPrescriptions: linkedPrescriptions.map((prescription) => ({
    collectedAt: formatDateTime(prescription.collected_at),
    createdAt: prescription.created_at.toISOString(),
    deletedAt: formatDateTime(prescription.deleted_at),
    expirationDate: formatDateOnly(prescription.expiration_date),
    id: prescription.id,
    issueDate: formatDateOnly(prescription.issue_date),
    patientId: prescription.patient_id,
    prescriptionType: prescription.prescription_type,
    receivedAt: formatDateTime(prescription.received_at),
    requestedAt: formatDateTime(prescription.requested_at),
    status: prescription.status,
  })),
  name: medication.name,
  nextGpContactDate: formatDateOnly(medication.next_gp_contact_date),
  notes: medication.notes,
  patientId: medication.patient_id,
  prescribingDoctor: medication.prescribing_doctor,
  quantity: medication.quantity,
  renewalCadence: medication.renewal_cadence,
  renewalTasks: renewalTasks.map((task) => ({
    autoRecurrenceEnabled: task.auto_recurrence_enabled,
    dueDate: formatDateOnly(task.due_date),
    id: task.id,
    recurrenceRule: task.recurrence_rule,
    scheduledAt: formatDateTime(task.scheduled_at),
    status: task.status,
    title: task.title,
  })),
  updatedAt: medication.updated_at.toISOString(),
});

const parseIncludeArchived = (value?: "true" | "false"): boolean =>
  value === "true";

export const createMedicationsModule = (
  authInstance: typeof auth,
  service = createMedicationsService(),
) =>
  new Elysia({ name: "medications-module" })
    .get(
      "/patients/:patientId/medications",
      async ({ params, query, request, status }) => {
        try {
          const session = await requireRequestSession(authInstance, request);
          const medications = await service.listMedications(
            session.user.id,
            params.patientId,
            {
              includeArchived: parseIncludeArchived(query.includeArchived),
            },
          );

          return {
            medications: medications.map(mapMedication),
          };
        } catch (error) {
          if (error instanceof PatientMedicationAccessError) {
            return status(404, patientNotFoundPayload);
          }

          return status(401, unauthorizedPayload);
        }
      },
      {
        params: patientIdParamsSchema,
        query: medicationListQuerySchema,
      },
    )
    .post(
      "/patients/:patientId/medications",
      async ({ body, params, request, status }) => {
        try {
          const session = await requireRequestSession(authInstance, request);
          const medication = await service.createMedication(
            session.user.id,
            params.patientId,
            {
              conditionId: body.conditionId ?? null,
              dosage: body.dosage.trim(),
              name: body.name.trim(),
              nextGpContactDate: body.nextGpContactDate ?? null,
              notes: normalizeOptionalText(body.notes) ?? null,
              prescribingDoctor:
                normalizeOptionalText(body.prescribingDoctor) ?? null,
              quantity: body.quantity.trim(),
              renewalCadence:
                normalizeOptionalText(body.renewalCadence) ?? null,
            },
          );

          return {
            medication: mapMedication(medication),
          };
        } catch (error) {
          if (error instanceof PatientMedicationAccessError) {
            return status(404, patientNotFoundPayload);
          }

          return status(401, unauthorizedPayload);
        }
      },
      {
        body: medicationBodySchema,
        params: patientIdParamsSchema,
      },
    )
    .get(
      "/medications/:medicationId",
      async ({ params, request, status }) => {
        try {
          const session = await requireRequestSession(authInstance, request);
          const medication = await service.getMedication(
            session.user.id,
            params.medicationId,
          );

          return {
            medication: mapMedication(medication),
          };
        } catch (error) {
          if (error instanceof MedicationAccessError) {
            return status(404, medicationNotFoundPayload);
          }

          return status(401, unauthorizedPayload);
        }
      },
      {
        params: medicationIdParamsSchema,
      },
    )
    .patch(
      "/medications/:medicationId",
      async ({ body, params, request, status }) => {
        try {
          const session = await requireRequestSession(authInstance, request);
          const medication = await service.updateMedication(
            session.user.id,
            params.medicationId,
            {
              ...(body.conditionId === undefined
                ? {}
                : { conditionId: body.conditionId }),
              ...(body.dosage === undefined
                ? {}
                : { dosage: body.dosage.trim() }),
              ...(body.name === undefined ? {} : { name: body.name.trim() }),
              ...(body.nextGpContactDate === undefined
                ? {}
                : { nextGpContactDate: body.nextGpContactDate }),
              ...(body.notes === undefined
                ? {}
                : (() => {
                    const notes = normalizeOptionalText(body.notes);

                    return notes === undefined ? {} : { notes };
                  })()),
              ...(body.prescribingDoctor === undefined
                ? {}
                : {
                    prescribingDoctor:
                      normalizeOptionalText(body.prescribingDoctor) ?? null,
                  }),
              ...(body.quantity === undefined
                ? {}
                : { quantity: body.quantity.trim() }),
              ...(body.renewalCadence === undefined
                ? {}
                : {
                    renewalCadence:
                      normalizeOptionalText(body.renewalCadence) ?? null,
                  }),
            },
          );

          return {
            medication: mapMedication(medication),
          };
        } catch (error) {
          if (error instanceof MedicationAccessError) {
            return status(404, medicationNotFoundPayload);
          }

          return status(401, unauthorizedPayload);
        }
      },
      {
        body: medicationUpdateBodySchema,
        params: medicationIdParamsSchema,
      },
    )
    .delete(
      "/medications/:medicationId",
      async ({ params, request, status }) => {
        try {
          const session = await requireRequestSession(authInstance, request);
          const medication = await service.archiveMedication(
            session.user.id,
            params.medicationId,
          );

          return {
            medication: mapMedication(medication),
          };
        } catch (error) {
          if (error instanceof MedicationAccessError) {
            return status(404, medicationNotFoundPayload);
          }

          return status(401, unauthorizedPayload);
        }
      },
      {
        params: medicationIdParamsSchema,
      },
    );
