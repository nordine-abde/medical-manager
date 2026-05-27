import { Elysia, t } from "elysia";

import type { auth } from "../../auth";
import { requireRequestSession } from "../../auth/session";
import { mapDocument } from "../documents/dto";
import { UnsupportedDocumentMimeTypeError } from "../documents/storage";
import {
  legacyPrescriptionTypeAlias,
  type PrescriptionType,
  prescriptionTypes,
} from "./repository";
import {
  createPrescriptionsService,
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

const dateOnlySchema = t.String({
  pattern: "^\\d{4}-\\d{2}-\\d{2}$",
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
  expirationDate: t.Optional(t.Nullable(dateOnlySchema)),
  issueDate: t.Optional(t.Nullable(dateOnlySchema)),
  notes: t.Optional(t.Nullable(t.String())),
  prescriptionType: prescriptionTypeSchema,
  subtype: t.Optional(t.Nullable(t.String())),
  taskId: t.Optional(
    t.Nullable(
      t.String({
        format: "uuid",
      }),
    ),
  ),
});

const prescriptionUpdateBodySchema = t.Object({
  expirationDate: t.Optional(t.Nullable(dateOnlySchema)),
  issueDate: t.Optional(t.Nullable(dateOnlySchema)),
  notes: t.Optional(t.Nullable(t.String())),
  prescriptionType: t.Optional(prescriptionTypeSchema),
  subtype: t.Optional(t.Nullable(t.String())),
  taskId: t.Optional(
    t.Nullable(
      t.String({
        format: "uuid",
      }),
    ),
  ),
});

const prescriptionListQuerySchema = t.Object({
  includeArchived: t.Optional(t.Union([t.Literal("true"), t.Literal("false")])),
  prescriptionType: t.Optional(prescriptionTypeSchema),
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

const invalidMultipartPayload = {
  error: "validation_error",
  message: "A multipart form with prescription fields and file is required.",
} as const;

const unsupportedDocumentTypePayload = {
  error: "unsupported_document_type",
  message: "Uploaded file type is not supported.",
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

const normalizeOptionalFormText = (
  value: File | string | null,
): string | null =>
  typeof value === "string" ? (normalizeOptionalText(value) ?? null) : null;

const isAcceptedPrescriptionType = (
  value: string,
): value is (typeof acceptedPrescriptionTypes)[number] =>
  acceptedPrescriptionTypes.includes(
    value as (typeof acceptedPrescriptionTypes)[number],
  );

const mapPrescription = (prescription: {
  created_at: Date;
  deleted_at: Date | null;
  expiration_date: Date | string | null;
  id: string;
  issue_date: Date | string | null;
  notes: string | null;
  patient_id: string;
  prescription_type: string;
  subtype: string | null;
  updated_at: Date;
}) => ({
  createdAt: prescription.created_at.toISOString(),
  deletedAt: formatDateTime(prescription.deleted_at),
  expirationDate: formatDateOnly(prescription.expiration_date),
  id: prescription.id,
  issueDate: formatDateOnly(prescription.issue_date),
  notes: prescription.notes,
  patientId: prescription.patient_id,
  prescriptionType: normalizePrescriptionType(prescription.prescription_type),
  subtype: prescription.subtype,
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

const parseCreatePrescriptionDocumentFormData = async (request: Request) => {
  const formData = await request.formData();
  const fileEntry = formData.get("file");
  const prescriptionTypeEntry = formData.get("prescriptionType");

  if (
    !(fileEntry instanceof File) ||
    typeof prescriptionTypeEntry !== "string" ||
    !isAcceptedPrescriptionType(prescriptionTypeEntry)
  ) {
    return null;
  }

  return {
    document: {
      file: fileEntry,
      notes: normalizeOptionalFormText(formData.get("documentNotes")),
    },
    prescription: {
      expirationDate: normalizeOptionalFormText(formData.get("expirationDate")),
      issueDate: normalizeOptionalFormText(formData.get("issueDate")),
      notes: normalizeOptionalFormText(formData.get("notes")),
      prescriptionType: normalizePrescriptionType(prescriptionTypeEntry),
      subtype: normalizeOptionalFormText(formData.get("subtype")),
    },
  };
};

const parseUpdatePrescriptionDocumentFormData = async (request: Request) => {
  const formData = await request.formData();
  const fileEntry = formData.get("file");

  if (!(fileEntry instanceof File)) {
    return null;
  }

  const prescription: {
    expirationDate?: string | null;
    issueDate?: string | null;
    notes?: string | null;
    prescriptionType?: PrescriptionType;
    subtype?: string | null;
  } = {};

  if (formData.has("expirationDate")) {
    prescription.expirationDate = normalizeOptionalFormText(
      formData.get("expirationDate"),
    );
  }

  if (formData.has("issueDate")) {
    prescription.issueDate = normalizeOptionalFormText(
      formData.get("issueDate"),
    );
  }

  if (formData.has("notes")) {
    prescription.notes = normalizeOptionalFormText(formData.get("notes"));
  }

  if (formData.has("prescriptionType")) {
    const prescriptionTypeEntry = formData.get("prescriptionType");

    if (
      typeof prescriptionTypeEntry !== "string" ||
      !isAcceptedPrescriptionType(prescriptionTypeEntry)
    ) {
      return null;
    }

    prescription.prescriptionType = normalizePrescriptionType(
      prescriptionTypeEntry,
    );
  }

  if (formData.has("subtype")) {
    prescription.subtype = normalizeOptionalFormText(formData.get("subtype"));
  }

  return {
    document: {
      file: fileEntry,
      notes: normalizeOptionalFormText(formData.get("documentNotes")),
    },
    prescription,
  };
};

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
              ...(query.prescriptionType === undefined
                ? {}
                : {
                    prescriptionType: normalizePrescriptionType(
                      query.prescriptionType,
                    ),
                  }),
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
              expirationDate: body.expirationDate ?? null,
              issueDate: body.issueDate ?? null,
              notes: normalizeOptionalText(body.notes) ?? null,
              prescriptionType: normalizePrescriptionType(
                body.prescriptionType,
              ),
              subtype: normalizeOptionalText(body.subtype) ?? null,
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
    .post(
      "/patients/:patientId/prescriptions/with-document",
      async ({ params, request, status }) => {
        let parsedFormData: Awaited<
          ReturnType<typeof parseCreatePrescriptionDocumentFormData>
        >;

        try {
          parsedFormData =
            await parseCreatePrescriptionDocumentFormData(request);
        } catch {
          return status(400, invalidMultipartPayload);
        }

        if (!parsedFormData) {
          return status(400, invalidMultipartPayload);
        }

        try {
          const session = await requireRequestSession(authInstance, request);
          const result = await service.createPrescriptionWithDocument(
            session.user.id,
            params.patientId,
            {
              ...parsedFormData.prescription,
              document: {
                fileBytes: await parsedFormData.document.file.arrayBuffer(),
                mimeType: parsedFormData.document.file.type,
                notes: parsedFormData.document.notes,
                originalFilename:
                  parsedFormData.document.file.name || "document",
                uploadedByUserId: session.user.id,
              },
            },
          );

          return {
            document: mapDocument(result.document),
            prescription: mapPrescription(result.prescription),
          };
        } catch (error) {
          if (error instanceof PatientPrescriptionAccessError) {
            return status(404, patientNotFoundPayload);
          }

          if (error instanceof UnsupportedDocumentMimeTypeError) {
            return status(400, unsupportedDocumentTypePayload);
          }

          return status(401, unauthorizedPayload);
        }
      },
      {
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
              ...(body.expirationDate === undefined
                ? {}
                : { expirationDate: body.expirationDate }),
              ...(body.issueDate === undefined
                ? {}
                : { issueDate: body.issueDate }),
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
      "/prescriptions/:prescriptionId/with-document",
      async ({ params, request, status }) => {
        let parsedFormData: Awaited<
          ReturnType<typeof parseUpdatePrescriptionDocumentFormData>
        >;

        try {
          parsedFormData =
            await parseUpdatePrescriptionDocumentFormData(request);
        } catch {
          return status(400, invalidMultipartPayload);
        }

        if (!parsedFormData) {
          return status(400, invalidMultipartPayload);
        }

        try {
          const session = await requireRequestSession(authInstance, request);
          const result = await service.updatePrescriptionWithDocument(
            session.user.id,
            params.prescriptionId,
            {
              ...parsedFormData.prescription,
              document: {
                fileBytes: await parsedFormData.document.file.arrayBuffer(),
                mimeType: parsedFormData.document.file.type,
                notes: parsedFormData.document.notes,
                originalFilename:
                  parsedFormData.document.file.name || "document",
                uploadedByUserId: session.user.id,
              },
            },
          );

          return {
            document: mapDocument(result.document),
            prescription: mapPrescription(result.prescription),
          };
        } catch (error) {
          if (error instanceof PrescriptionAccessError) {
            return status(404, prescriptionNotFoundPayload);
          }

          if (error instanceof UnsupportedDocumentMimeTypeError) {
            return status(400, unsupportedDocumentTypePayload);
          }

          return status(401, unauthorizedPayload);
        }
      },
      {
        params: prescriptionIdParamsSchema,
      },
    );
