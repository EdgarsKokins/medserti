import type { CmeCertificate, NurseTopic } from "./types";

/*
 * Nurse-only helpers (Cabinet Regulation No. 630, likumi.lv/ta/id/355331). No server-only imports, so the
 * certificate list, review panel and tests can all use them.
 */

export const NURSE_TOPICS: NurseTopic[] = ["emergency", "infection_control", "patient_safety", "nursing", "other"];

/** The topic a nurse's certificate counts toward; older certificates only carry the emergency-care flag */
export const nurseTopicOf = (c: Pick<CmeCertificate, "nurseTopic" | "emergencyCare">): NurseTopic =>
  c.nurseTopic ?? (c.emergencyCare ? "emergency" : "other");

// keyword stems on folded text (lowercase, no diacritics); Cyrillic stems avoid "й", which folds to "и"
const TOPIC_RULES: [NurseTopic, RegExp][] = [
  ["infection_control", /infekcij\p{L}*\s+(?:kontrol|profilakse|drosib)|infection\s+(?:control|prevention)|hand\s+hygiene|roku\s+higien|sterilizacij|dezinfekcij|инфекционн\p{L}*\s+(?:контрол|безопасн)|профилактик\p{L}*\s+инфекц/u],
  ["patient_safety", /pacient\p{L}*\s+drosib|patient\s+safety|безопасност\p{L}*\s+пациент/u],
  ["emergency", /neatliekam|pirm\p{L}*\s+palidzib|reanimacij|atdzivinasan|emergency|resuscitation|first\s+aid|life\s+support|неотложн|реанимац|первая\s+помощ/u],
  ["nursing", /mas\p{L}*\s+(?:aprup|praks|kompetenc|darb)|aprup\p{L}*\s+(?:process|pacient)|pacient\p{L}*\s+aprup|nursing|nurses?\b|сестринск|медсест|уход\p{L}*\s+за\s+пациент/u],
];

/** Suggested topic from certificate text (folded). BLS/ALS-style course codes are checked on the raw text. */
export function suggestNurseTopic(fold: string, raw = ""): NurseTopic {
  for (const [topic, re] of TOPIC_RULES) if (re.test(fold)) return topic;
  if (/(?<![\p{L}])(?:BLS|ALS|ACLS|PALS|EPALS|ATLS|CPR)(?![\p{L}])/u.test(raw)) return "emergency";
  return "other";
}

/**
 * Point 47 (from 01 Jan 2027): VI counts only courses "ko ... ir apstiprinājusi Latvijas Ārstu biedrība, Latvijas
 * Ārstniecības personu profesionālo organizāciju savienība un Latvijas Māsu asociācija". Point 65 keeps courses up
 * to 31 Dec 2026 without that test.
 */
export const APPROVAL_REQUIRED_FROM = "2027-01-01";

/** LĀB "TIP2026/9696", LMA "NTI/S-1170", "M5/NTI/P130_0826/05082026" */
const APPROVAL_ID = /(?:^|[^a-z])(?:tip\s?(?:19|20)\d{2}\/\d+|nti\s*\/)/i;
const APPROVAL_BODY =
  /latvijas\s+(?:arstu\s+biedrib|masu\s+asociacij|arstniecibas\s+personu\s+profesionalo\s+organizaciju\s+savienib)|(?<![\p{L}])(?:lab|lapos|lma)(?![\p{L}])/iu;

const foldText = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** The certificate names an LĀB / LĀPOS / LMA approval: by approval number, or the body in organizer or title */
export function approvalRecognised(c: Pick<CmeCertificate, "approvalId" | "organizer" | "title">): boolean {
  if (c.approvalId && APPROVAL_ID.test(c.approvalId)) return true;
  return APPROVAL_BODY.test(foldText(`${c.organizer ?? ""} ${c.title ?? ""} ${c.approvalId ?? ""}`));
}

/** Flag only, never exclude: a dated 2027+ certificate with no recognisable approval */
export function needsApprovalCheck(c: Pick<CmeCertificate, "date" | "approvalId" | "organizer" | "title">): boolean {
  return !!c.date && c.date >= APPROVAL_REQUIRED_FROM && !approvalRecognised(c);
}
