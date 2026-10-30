import "server-only";
import { matchesSpecialty } from "./parse";
import { computeProgress, type Progress } from "./rules";
import { asProfile, MAIN_CERT, profileCerts, type ProfileCert } from "./profileCerts";
import type { CmeCertificate, Profile } from "./types";

/**
 * Which of the user's own certificates an uploaded one counts toward. The user's choice (countsFor) wins. Otherwise the
 * title decides, then the organizer: the first certificate whose specialty it names, the main one first. "Algoloģijas
 * kursi" by the neurologists' society goes to algology. Anything else goes to the main certificate. One event, one
 * certificate: Reg. 391 does not say an event may count for two.
 */
export function assignedCert(c: Pick<CmeCertificate, "countsFor" | "title" | "organizer">, p: Profile, certs = profileCerts(p)): string {
  if (c.countsFor && certs.some((x) => x.id === c.countsFor)) return c.countsFor;
  if (certs.length === 1) return MAIN_CERT;
  for (const text of [c.title, c.organizer]) {
    const hit = text ? certs.find((x) => x.specialty && matchesSpecialty(text, x.specialty)) : undefined;
    if (hit) return hit.id;
  }
  return MAIN_CERT;
}

/** id -> the certificate each upload counts toward, for the pages that show one certificate at a time */
export const assignments = (p: Profile, list: CmeCertificate[]) => {
  const certs = profileCerts(p);
  return Object.fromEntries(list.map((c) => [c.id, assignedCert(c, p, certs)]));
};

/**
 * The uploads that count toward one certificate, and its progress. An upload placed on an extra certificate by its
 * specialty (not by the user) is in that specialty, whatever its "Savā specialitātē" flag says about the main one.
 */
export function certProgress(p: Profile, all: CmeCertificate[], cert: ProfileCert, today = new Date()): { certs: CmeCertificate[]; progress: Progress } {
  const certs = profileCerts(p);
  const mine = all
    .filter((c) => assignedCert(c, p, certs) === cert.id)
    .map((c) => (cert.id !== MAIN_CERT && !c.countsFor ? { ...c, inSpecialty: true } : c));
  return { certs: mine, progress: computeProgress(asProfile(p, cert), mine, today) };
}
