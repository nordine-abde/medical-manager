import { Elysia, t } from "elysia";

import type { auth } from "../../auth";
import { requireRequestSession } from "../../auth/session";
import {
  legacyPrescriptionTypeAlias,
  type PrescriptionStatus,
  type PrescriptionType,
  prescriptionStatuses,
  prescriptionTypes,
} from "./repository";
import {
  createPrescriptionsService,
  InvalidPrescriptionStatusTransitionError,
  PatientPrescriptionAccessError,
  PrescriptionAccessError,
} from "./service";

const acceptedPrescriptionTypes = [
  ...prescriptionTypes,
  legacyPrescriptionTypeAlias,
] as const;

const prescriptionTypeSchema = t.Union(
  acceptedPrescriptionTypes.map((prescriptionType) =>
    t.Literal(prescriptionType),
  ),
);

const prescriptionStatusSchema = t.Union(
  prescriptionStatuses.map((status) => t.Literal(status)),
);

const dateOnlySchema = t.String({
  pattern: "^\\d{4}-\\d{2}-\\d{2}$",
});

const dateTimeSchema = t.String({
  format: "date-time",
});

const patientIdParamsSchema = t.Object({
  patientId: t.String({
    format: "uuid",
  }),
});

const prescriptionIdParamsSchema = t.Object({
  prescriptionId: t.String({
    format: "uuid",
  }),
});

const prescriptionBodySchema = t.Object({
  collectedAt: t.Optional(t.Nullable(dateTimeSchema)),
  expirationDate: t.Optional(t.Nullable(dateOnlySchema)),
  issueDate: t.Optional(t.Nullable(dateOnlySchema)),
  medicationId: t.Optional(
    t.Nullable(
      t.String({
        format: "uuid",
      }),
    ),
  ),
  notes: t.Optional(t.Nullable(t.String())),
  prescriptionType: prescriptionTypeSchema,
  subtype: t.Optional(t.Nullable(t.String())),
  receivedAt: t.Optional(t.Nullable(dateTimeSchema)),
  requestedAt: t.Optional(t.Nullable(dateTimeSchema)),
  status: t.Optional(prescriptionStatusSchema),
  taskId: t.Optional(
    t.Nullable(
      t.String({
        format: "uuid",
      }),
    ),
  ),
});

const prescriptionUpdateBodySchema = t.Object({
  collectedAt: t.Optional(t.Nullable(dateTimeSchema)),
  expirationDate: t.Optional(t.Nullable(dateOnlySchema)),
  issueDate: t.Optional(t.Nullable(dateOnlySchema)),
  medicationId: t.Optional(
    t.Nullable(
      t.String({
        format: "uuid",
      }),
    ),
  ),
  notes: t.Optional(t.Nullable(t.String())),
  prescriptionType: t.Optional(prescriptionTypeSchema),
  subtype: t.Optional(t.Nullable(t.String())),
  receivedAt: t.Optional(t.Nullable(dateTimeSchema)),
  requestedAt: t.Optional(t.Nullable(dateTimeSchema)),
  taskId: t.Optional(
    t.Nullable(
      t.String({
        format: "uuid",
      }),
    ),
  ),
});

const prescriptionStatusBodySchema = t.Object({
  collectedAt: t.Optional(t.Nullable(dateTimeSchema)),
  receivedAt: t.Optional(t.Nullable(dateTimeSchema)),
  requestedAt: t.Optional(t.Nullable(dateTimeSchema)),
  status: prescriptionStatusSchema,
});

const prescriptionListQuerySchema = t.Object({
  includeArchived: t.Optional(t.Union([t.Literal("true"), t.Literal("false")])),
  medicationId: t.Optional(
    t.String({
      format: "uuid",
    }),
  ),
  prescriptionType: t.Optional(prescriptionTypeSchema),
  status: t.Optional(prescriptionStatusSchema),
});

const unauthorizedPayload = {
  error: "unauthorized",
  message: "Authentication required.",
} as const;

const patientNotFoundPayload = {
  error: "patient_not_found",
  message: "Patient not found.",
} as const;

const prescriptionNotFoundPayload = {
  error: "prescription_not_found",
  message: "Prescription not found.",
} as const;

const invalidPrescriptionStatusTransitionPayload = {
  error: "invalid_prescription_status_transition",
  message: "Prescription status transition is not allowed.",
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

const mapPrescription = (prescription: {
  collected_at: Date | null;
  created_at: Date;
  deleted_at: Date | null;
  expiration_date: Date | string | null;
  id: string;
  issue_date: Date | string | null;
  medication_id: string | null;
  notes: string | null;
  patient_id: string;
  prescription_type: string;
  subtype: string | null;
  received_at: Date | null;
  requested_at: Date | null;
  status: PrescriptionStatus;
  task_id: string | null;
  updated_at: Date;
}) => ({
  collectedAt: formatDateTime(prescription.collected_at),
  createdAt: prescription.created_at.toISOString(),
  deletedAt: formatDateTime(prescription.deleted_at),
  expirationDate: formatDateOnly(prescription.expiration_date),
  id: prescription.id,
  issueDate: formatDateOnly(prescription.issue_date),
  medicationId: prescription.medication_id,
  notes: prescription.notes,
  patientId: prescription.patient_id,
  prescriptionType: normalizePrescriptionType(prescription.prescription_type),
  receivedAt: formatDateTime(prescription.received_at),
  requestedAt: formatDateTime(prescription.requested_at),
  status: prescription.status,
  subtype: prescription.subtype,
  taskId: prescription.task_id,
  updatedAt: prescription.updated_at.toISOString(),
});

const parseIncludeArchived = (value?: "true" | "false"): boolean =>
  value === "true";

const normalizePrescriptionType = (
  prescriptionType: string,
): PrescriptionType =>
  prescriptionType === legacyPrescriptionTypeAlias
    ? "visit"
    : (prescriptionType as PrescriptionType);

export const createPrescriptionsModule = (
  authInstance: typeof auth,
  service = createPrescriptionsService(),
) =>
  new Elysia({ name: "prescriptions-module" })
    .get(
      "/patients/:patientId/prescriptions",
      async ({ params, query, request, status }) => {
        try {
          const session = await requireRequestSession(authInstance, request);
          const prescriptions = await service.listPrescriptions(
            session.user.id,
            params.patientId,
            {
              includeArchived: parseIncludeArchived(query.includeArchived),
              ...(query.medicationId === undefined
                ? {}
                : { medicationId: query.medicationId }),
              ...(query.prescriptionType === undefined
                ? {}
                : {
                    prescriptionType: normalizePrescriptionType(
                      query.prescriptionType,
                    ),
                  }),
              ...(query.status === undefined ? {} : { status: query.status }),
            },
          );

          return {
            prescriptions: prescriptions.map(mapPrescription),
          };
        } catch (error) {
          if (error instanceof PatientPrescriptionAccessError) {
            return status(404, patientNotFoundPayload);
          }

          return status(401, unauthorizedPayload);
        }
      },
      {
        params: patientIdParamsSchema,
        query: prescriptionListQuerySchema,
      },
    )
    .post(
      "/patients/:patientId/prescriptions",
      async ({ body, params, request, status }) => {
        try {
          const session = await requireRequestSession(authInstance, request);
          const prescription = await service.createPrescription(
            session.user.id,
            params.patientId,
            {
              collectedAt: body.collectedAt ?? null,
              expirationDate: body.expirationDate ?? null,
              issueDate: body.issueDate ?? null,
              medicationId: body.medicationId ?? null,
              notes: normalizeOptionalText(body.notes) ?? null,
              prescriptionType: normalizePrescriptionType(
                body.prescriptionType,
              ),
              receivedAt: body.receivedAt ?? null,
              requestedAt: body.requestedAt ?? null,
              status: body.status ?? "needed",
              subtype: normalizeOptionalText(body.subtype) ?? null,
              taskId: body.taskId ?? null,
            },
          );

          return {
            prescription: mapPrescription(prescription),
          };
        } catch (error) {
          if (error instanceof PatientPrescriptionAccessError) {
            return status(404, patientNotFoundPayload);
          }

          return status(401, unauthorizedPayload);
        }
      },
      {
        body: prescriptionBodySchema,
        params: patientIdParamsSchema,
      },
    )
    .get(
      "/prescriptions/:prescriptionId",
      async ({ params, request, status }) => {
        try {
          const session = await requireRequestSession(authInstance, request);
          const prescription = await service.getPrescription(
            session.user.id,
            params.prescriptionId,
          );

          return {
            prescription: mapPrescription(prescription),
          };
        } catch (error) {
          if (error instanceof PrescriptionAccessError) {
            return status(404, prescriptionNotFoundPayload);
          }

          return status(401, unauthorizedPayload);
        }
      },
      {
        params: prescriptionIdParamsSchema,
      },
    )
    .patch(
      "/prescriptions/:prescriptionId",
      async ({ body, params, request, status }) => {
        try {
          const session = await requireRequestSession(authInstance, request);
          const prescription = await service.updatePrescription(
            session.user.id,
            params.prescriptionId,
            {
              ...(body.collectedAt === undefined
                ? {}
                : { collectedAt: body.collectedAt }),
              ...(body.expirationDate === undefined
                ? {}
                : { expirationDate: body.expirationDate }),
              ...(body.issueDate === undefined
                ? {}
                : { issueDate: body.issueDate }),
              ...(body.medicationId === undefined
                ? {}
                : { medicationId: body.medicationId }),
              ...(body.notes === undefined
                ? {}
                : { notes: normalizeOptionalText(body.notes) ?? null }),
              ...(body.prescriptionType === undefined
                ? {}
                : {
                    prescriptionType: normalizePrescriptionType(
                      body.prescriptionType,
                    ),
                  }),
              ...(body.subtype === undefined
                ? {}
                : { subtype: normalizeOptionalText(body.subtype) ?? null }),
              ...(body.receivedAt === undefined
                ? {}
                : { receivedAt: body.receivedAt }),
              ...(body.requestedAt === undefined
                ? {}
                : { requestedAt: body.requestedAt }),
              ...(body.taskId === undefined ? {} : { taskId: body.taskId }),
            },
          );

          return {
            prescription: mapPrescription(prescription),
          };
        } catch (error) {
          if (error instanceof PrescriptionAccessError) {
            return status(404, prescriptionNotFoundPayload);
          }

          return status(401, unauthorizedPayload);
        }
      },
      {
        body: prescriptionUpdateBodySchema,
        params: prescriptionIdParamsSchema,
      },
    )
    .patch(
      "/prescriptions/:prescriptionId/status",
      async ({ body, params, request, status }) => {
        try {
          const session = await requireRequestSession(authInstance, request);
          const prescription = await service.changePrescriptionStatus(
            session.user.id,
            params.prescriptionId,
            {
              status: body.status,
              ...(body.collectedAt === undefined
                ? {}
                : { collectedAt: body.collectedAt }),
              ...(body.receivedAt === undefined
                ? {}
                : { receivedAt: body.receivedAt }),
              ...(body.requestedAt === undefined
                ? {}
                : { requestedAt: body.requestedAt }),
            },
          );

          return {
            prescription: mapPrescription(prescription),
          };
        } catch (error) {
          if (error instanceof InvalidPrescriptionStatusTransitionError) {
            return status(409, invalidPrescriptionStatusTransitionPayload);
          }

          if (error instanceof PrescriptionAccessError) {
            return status(404, prescriptionNotFoundPayload);
          }

          return status(401, unauthorizedPayload);
        }
      },
      {
        body: prescriptionStatusBodySchema,
        params: prescriptionIdParamsSchema,
      },
    );
