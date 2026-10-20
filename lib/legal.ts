/**
 * Data controller details for the privacy policy and terms. Fill these in once the SIA is registered:
 * the pages show whatever is here, and a value in [square brackets] is shown as "to be specified".
 */
export const CONTROLLER = {
  name: "SIA Medserti",
  regNo: "[reģistrācijas numurs tiks precizēts]",
  address: "[juridiskā adrese tiks precizēta]",
};

/** Date the current privacy policy and terms took effect (YYYY-MM-DD). Change it whenever the texts change. */
export const LEGAL_UPDATED = "2026-10-20";

/** Data State Inspectorate, the Latvian data protection authority */
export const DVI_URL = "https://www.dvi.gov.lv";

/** True while a value is still a placeholder */
export const isPlaceholder = (v: string) => /^\s*SIA \[|^\s*\[/.test(v);
