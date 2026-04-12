export const documentTypes = [
  "prescription",
  "exam_result",
  "visit_report",
  "discharge_letter",
  "general_attachment",
] as const;

export type DocumentType = (typeof documentTypes)[number];

export const relatedEntityTypes = [
  "patient",
  "medical_instruction",
  "prescription",
  "booking",
  "care_event",
  "medication",
] as const;

export type RelatedEntityType = (typeof relatedEntityTypes)[number];

export interface DocumentRecord {
  documentType: DocumentType;
  downloadUrl: string;
  fileSizeBytes: number;
  id: string;
  mimeType: string;
  notes: string | null;
  originalFilename: string;
  patientId: string;
  relatedEntityId: string;
  relatedEntityType: RelatedEntityType;
  uploadedAt: string;
  uploadedByUserId: string;
}

export interface DocumentUploadPayload {
  documentType: DocumentType;
  file: File;
  notes: string | null;
  relatedEntityId: string;
  relatedEntityType: RelatedEntityType;
}
