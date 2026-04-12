import { defineStore } from "pinia";

import { listDocumentsRequest, uploadDocumentRequest } from "./api";
import type { DocumentRecord, DocumentUploadPayload } from "./types";

interface DocumentsState {
  documents: DocumentRecord[];
  status: "idle" | "loading" | "ready";
}

const sortDocuments = (documents: DocumentRecord[]): DocumentRecord[] =>
  [...documents].sort((left, right) => {
    const dateOrder = right.uploadedAt.localeCompare(left.uploadedAt);

    if (dateOrder !== 0) {
      return dateOrder;
    }

    return left.originalFilename.localeCompare(right.originalFilename);
  });

const upsertDocument = (
  documents: DocumentRecord[],
  document: DocumentRecord,
): DocumentRecord[] => {
  const existingIndex = documents.findIndex((item) => item.id === document.id);

  if (existingIndex === -1) {
    return sortDocuments([...documents, document]);
  }

  return sortDocuments(
    documents.map((item) => (item.id === document.id ? document : item)),
  );
};

let lastPatientId = "";

export const useDocumentsStore = defineStore("documents", {
  state: (): DocumentsState => ({
    documents: [],
    status: "idle",
  }),
  actions: {
    async loadDocuments(patientId: string) {
      this.status = "loading";
      lastPatientId = patientId;

      try {
        this.documents = sortDocuments(await listDocumentsRequest(patientId));
        this.status = "ready";
      } catch (error) {
        this.status = "ready";
        throw error;
      }
    },
    async refreshDocuments() {
      if (!lastPatientId) {
        return;
      }

      await this.loadDocuments(lastPatientId);
    },
    async uploadDocument(
      patientId: string,
      payload: DocumentUploadPayload,
    ): Promise<DocumentRecord> {
      const document = await uploadDocumentRequest(patientId, payload);
      this.documents = upsertDocument(this.documents, document);
      return document;
    },
  },
});
