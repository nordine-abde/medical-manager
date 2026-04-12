import type { DocumentRecord, RelatedEntityType } from "./types";

export const filterDocumentsByRelatedEntity = (
  documents: DocumentRecord[],
  relatedEntityType: RelatedEntityType,
  relatedEntityId: string | null | undefined,
): DocumentRecord[] => {
  if (!relatedEntityId) {
    return [];
  }

  return documents.filter(
    (document) =>
      document.relatedEntityType === relatedEntityType &&
      document.relatedEntityId === relatedEntityId,
  );
};
