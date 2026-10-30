import type { ExtraCertificate, Profile } from "./types";

/**
 * The user's own certificates: the main one (the profile's own fields) and any extra ones (Profile.extraCertificates).
 * Pure, so pages, the browser and the cron read them the same way.
 */
export const MAIN_CERT = "main";
export const MAX_EXTRA_CERTS = 3;

export type ProfileCert = Omit<ExtraCertificate, "specialtyCode"> & { specialtyCode: string | null };

export function profileCerts(p: Profile): ProfileCert[] {
  const main: ProfileCert = {
    id: MAIN_CERT,
    specialty: p.specialty,
    specialtyCode: p.specialtyCode ?? null,
    certificateNumber: p.certificateNumber,
    certificateIssued: p.certificateIssued,
    certificateExpires: p.certificateExpires,
  };
  // nurses hold no certificate (they re-register), so they have one record only
  return p.profession === "nurse" ? [main] : [main, ...(p.extraCertificates ?? [])];
}

/** The profile as if this certificate were its only one: what the rules, the export and the reminders read */
export function asProfile(p: Profile, c: ProfileCert): Profile {
  return {
    ...p,
    specialty: c.specialty,
    specialtyCode: c.specialtyCode,
    certificateNumber: c.certificateNumber,
    certificateIssued: c.certificateIssued,
    certificateExpires: c.certificateExpires,
    extraCertificates: undefined,
  };
}

/** The certificate a ?sert= address names, or the main one */
export function pickCert(p: Profile, id: string | null | undefined): ProfileCert {
  const all = profileCerts(p);
  return all.find((c) => c.id === id) ?? all[0];
}
