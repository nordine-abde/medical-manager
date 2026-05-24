import type { PrescriptionRecord } from "./types";

export const formatPrescriptionDisplayLabel = (
  prescription: PrescriptionRecord,
  options: {
    d: (value: Date | number, format?: string) => string;
    t: (key: string, params?: Record<string, unknown>) => string;
  },
): string => {
  const { t, d } = options;

  const typeLabel = t(`prescriptions.types.${prescription.prescriptionType}`);
  const subtype = prescription.subtype?.trim();

  const parts: string[] = [typeLabel];
  if (subtype) {
    parts.push(`/ ${subtype}`);
  }

  const dateParts: string[] = [];
  if (prescription.issueDate) {
    dateParts.push(
      `${t("prescriptions.fields.issueDate")} ${d(new Date(`${prescription.issueDate}T00:00:00`), "short")}`,
    );
  }
  if (prescription.expirationDate) {
    dateParts.push(
      `${t("prescriptions.fields.expirationDate")} ${d(new Date(`${prescription.expirationDate}T00:00:00`), "short")}`,
    );
  }

  if (dateParts.length > 0) {
    parts.push("—");
    parts.push(dateParts.join(" · "));
  }

  return parts.join(" ");
};
