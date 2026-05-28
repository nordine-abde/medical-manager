import type { DocumentType, RelatedEntityType } from "./repository";

const formatDateTime = (value: Date): string => value.toISOString();

export const mapDocument = (document: {
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
  previewUrl: `/api/v1/documents/${document.id}/preview`,
  relatedEntityId: document.related_entity_id,
  relatedEntityType: document.related_entity_type,
  uploadedAt: formatDateTime(document.uploaded_at),
  uploadedByUserId: document.uploaded_by_user_id,
});
