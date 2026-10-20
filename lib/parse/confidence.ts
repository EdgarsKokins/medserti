import type { CmeCertificate, ConfidenceField } from "../types";

/** A parsed field with lower confidence is named in a "lowConfidence" note and marked in the review panel */
export const LOW_CONFIDENCE = 0.7;

/** Should the review panel mark this field? Only while unconfirmed and still holding the parsed value. */
export function isUnsure(cert: Pick<CmeCertificate, "status" | "fieldConfidence">, field: ConfidenceField): boolean {
  const c = cert.fieldConfidence?.[field];
  return cert.status !== "confirmed" && c != null && c < LOW_CONFIDENCE;
}
