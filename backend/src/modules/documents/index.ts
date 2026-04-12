import { Elysia, t } from "elysia";

import type { auth } from "../../auth";
import { requireRequestSession } from "../../auth/session";
import {
  type DocumentType,
  documentTypes,
  type RelatedEntityType,
  relatedEntityTypes,
} from "./repository";
import {
  createDocumentsService,
  DocumentAccessError,
  PatientDocumentAccessError,
  RelatedEntityNotFoundError,
} from "./service";
import { UnsupportedDocumentMimeTypeError } from "./storage";

const patientIdParamsSchema = t.Object({
  patientId: t.String({
    format: "uuid",
  }),
});

const documentIdParamsSchema = t.Object({
  documentId: t.String({
    format: "uuid",
  }),
});

const unauthorizedPayload = {
  error: "unauthorized",
  message: "Authentication required.",
} as const;

const patientNotFoundPayload = {
  error: "patient_not_found",
  message: "Patient not found.",
} as const;

const documentNotFoundPayload = {
  error: "document_not_found",
  message: "Document not found.",
} as const;

const relatedEntityNotFoundPayload = {
  error: "related_entity_not_found",
  message: "Related entity not found.",
} as const;

const unsupportedDocumentTypePayload = {
  error: "unsupported_document_type",
  message: "Uploaded file type is not supported.",
} as const;

const invalidMultipartPayload = {
  error: "validation_error",
  message:
    "A multipart form with file, documentType, relatedEntityType, and relatedEntityId is required.",
} as const;

const formatDateTime = (value: Date): string => value.toISOString();

const mapDocument = (document: {
  document_type: DocumentType;
  file_size_bytes: number;
  id: string;
  mime_type: string;
  notes: string | null;
  original_filename: string;
  patient_id: string;
  related_entity_id: string;
  related_entity_type: RelatedEntityType;
  uploaded_at: Date;
  uploaded_by_user_id: string;
}) => ({
  documentType: document.document_type,
  downloadUrl: `/api/v1/documents/${document.id}/download`,
  fileSizeBytes: document.file_size_bytes,
  id: document.id,
  mimeType: document.mime_type,
  notes: document.notes,
  originalFilename: document.original_filename,
  patientId: document.patient_id,
  relatedEntityId: document.related_entity_id,
  relatedEntityType: document.related_entity_type,
  uploadedAt: formatDateTime(document.uploaded_at),
  uploadedByUserId: document.uploaded_by_user_id,
});

const isUuid = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );

const isDocumentType = (value: string): value is DocumentType =>
  documentTypes.includes(value as DocumentType);

const isRelatedEntityType = (value: string): value is RelatedEntityType =>
  relatedEntityTypes.includes(value as RelatedEntityType);

const normalizeOptionalText = (value: string | File | null): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  return value.trim() || null;
};

const parseUploadFormData = async (request: Request) => {
  const formData = await request.formData();
  const fileEntry = formData.get("file");
  const documentTypeEntry = formData.get("documentType");
  const relatedEntityTypeEntry = formData.get("relatedEntityType");
  const relatedEntityIdEntry = formData.get("relatedEntityId");

  if (
    !(fileEntry instanceof File) ||
    typeof documentTypeEntry !== "string" ||
    typeof relatedEntityTypeEntry !== "string" ||
    typeof relatedEntityIdEntry !== "string"
  ) {
    return null;
  }

  const documentType = documentTypeEntry.trim();
  const relatedEntityType = relatedEntityTypeEntry.trim();
  const relatedEntityId = relatedEntityIdEntry.trim();

  if (
    !isDocumentType(documentType) ||
    !isRelatedEntityType(relatedEntityType) ||
    !isUuid(relatedEntityId)
  ) {
    return null;
  }

  return {
    documentType,
    file: fileEntry,
    notes: normalizeOptionalText(formData.get("notes")),
    relatedEntityId,
    relatedEntityType,
  };
};

const buildDownloadHeaders = (document: {
  file_size_bytes: number;
  id: string;
  mime_type: string;
  original_filename: string;
}) =>
  new Headers({
    "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(document.original_filename)}`,
    "content-length": document.file_size_bytes.toString(),
    "content-type": document.mime_type,
    "x-document-id": document.id,
  });

export const createDocumentsModule = (
  authInstance: typeof auth,
  service = createDocumentsService(),
) =>
  new Elysia({ name: "documents-module" })
    .get(
      "/patients/:patientId/documents",
      async ({ params, request, status }) => {
        try {
          const session = await requireRequestSession(authInstance, request);
          const documents = await service.listDocuments(
            session.user.id,
            params.patientId,
          );

          return {
            documents: documents.map(mapDocument),
          };
        } catch (error) {
          if (error instanceof PatientDocumentAccessError) {
            return status(404, patientNotFoundPayload);
          }

          return status(401, unauthorizedPayload);
        }
      },
      {
        params: patientIdParamsSchema,
      },
    )
    .post(
      "/patients/:patientId/documents",
      async ({ params, request, status }) => {
        let session: Awaited<ReturnType<typeof requireRequestSession>>;

        try {
          session = await requireRequestSession(authInstance, request);
        } catch {
          return status(401, unauthorizedPayload);
        }

        let parsedFormData: Awaited<ReturnType<typeof parseUploadFormData>>;

        try {
          parsedFormData = await parseUploadFormData(request);
        } catch {
          return status(400, invalidMultipartPayload);
        }

        if (!parsedFormData) {
          return status(400, invalidMultipartPayload);
        }

        try {
          const document = await service.createDocument(
            session.user.id,
            params.patientId,
            {
              documentType: parsedFormData.documentType,
              fileBytes: await parsedFormData.file.arrayBuffer(),
              mimeType: parsedFormData.file.type,
              notes: parsedFormData.notes,
              originalFilename: parsedFormData.file.name || "document",
              relatedEntityId: parsedFormData.relatedEntityId,
              relatedEntityType: parsedFormData.relatedEntityType,
            },
          );

          return {
            document: mapDocument(document),
          };
        } catch (error) {
          if (error instanceof PatientDocumentAccessError) {
            return status(404, patientNotFoundPayload);
          }

          if (error instanceof RelatedEntityNotFoundError) {
            return status(404, relatedEntityNotFoundPayload);
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
      "/documents/:documentId",
      async ({ params, request, status }) => {
        try {
          const session = await requireRequestSession(authInstance, request);
          const document = await service.getDocument(
            session.user.id,
            params.documentId,
          );

          return {
            document: mapDocument(document),
          };
        } catch (error) {
          if (error instanceof DocumentAccessError) {
            return status(404, documentNotFoundPayload);
          }

          return status(401, unauthorizedPayload);
        }
      },
      {
        params: documentIdParamsSchema,
      },
    )
    .get(
      "/documents/:documentId/download",
      async ({ params, request, status }) => {
        try {
          const session = await requireRequestSession(authInstance, request);
          const { bytes, document } = await service.downloadDocument(
            session.user.id,
            params.documentId,
          );

          return new Response(bytes, {
            headers: buildDownloadHeaders(document),
            status: 200,
          });
        } catch (error) {
          if (error instanceof DocumentAccessError) {
            return status(404, documentNotFoundPayload);
          }

          return status(401, unauthorizedPayload);
        }
      },
      {
        params: documentIdParamsSchema,
      },
    );
