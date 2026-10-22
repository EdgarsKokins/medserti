/* Each enum is one array, so the types and the API validation (z.enum(ARR)) cannot drift apart. */

export const PROFESSIONS = ["doctor", "dentist", "functional_specialist", "physician_assistant", "nurse", "midwife", "other_practitioner"] as const;
export type Profession = (typeof PROFESSIONS)[number];

export const CERTIFICATION_KINDS = ["specialty", "method"] as const;
export type CertificationKind = (typeof CERTIFICATION_KINDS)[number];

/** Certificate files we accept and parse */
export const FILE_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: string;
  /** ISO time the user ticked "I agree to the terms and privacy policy" at registration; missing on accounts made before Oct 2026 */
  termsAcceptedAt?: string;
  /** LEGAL_UPDATED (lib/legal.ts) of the texts they agreed to */
  termsVersion?: string;
  /** Bumped on password reset; sessions carrying an older version are rejected (missing = 0) */
  sessionVersion?: number;
  profile: Profile;
}

export interface Profile {
  fullName: string;
  profession: Profession;
  /** LV name from the LĀB list (lib/specialties.ts), or free text when specialtyCode is "other" */
  specialty: string;
  /** LĀB specialty code, "other" for free text; missing on profiles saved before the list existed */
  specialtyCode?: string | null;
  certificationKind: CertificationKind;
  /** Practitioner register ID / certificate number, optional */
  certificateNumber: string;
  /** YYYY-MM-DD, date the current certificate was issued (start of the 5-year window) */
  certificateIssued: string | null;
  /** YYYY-MM-DD, defaults to issued + 5 years, editable */
  certificateExpires: string | null;
}

/** Annex 4 of Cabinet Regulation No. 391 (No. 487 version, 18 Aug 2026) grouped into the buckets that matter for counting */
export const CME_CATEGORIES = [
  "professional_meeting", // Annex 4 item 1
  "training_latvia", // item 2, 5, 6, 8
  "training_abroad", // item 3
  "interdisciplinary_conference", // item 4, 4.1
  "e_learning", // item 7, 9
  "practical_training", // item 10, capped at 16%
  "lecture_or_publication", // items 22-27
  "degree", // items 11-13
  "other", // items 14-21, 28-30
] as const;
export type CmeCategory = (typeof CME_CATEGORIES)[number];

/** Reg. 630 point 26.3 topics a nurse's hours count toward from 01 Jan 2027; "nursing" = nurse competence topics */
export const NURSE_TOPICS = ["emergency", "infection_control", "patient_safety", "nursing", "other"] as const;
export type NurseTopic = (typeof NURSE_TOPICS)[number];

export type CertStatus = "parsing" | "needs_review" | "confirmed" | "failed";

export interface CmeCertificate {
  id: string;
  userId: string;
  fileName: string;
  /** storage pathname of the uploaded file */
  filePath: string;
  contentType: string;
  uploadedAt: string;
  status: CertStatus;
  title: string;
  organizer: string;
  /** YYYY-MM-DD, event (start) date */
  date: string | null;
  endDate: string | null;
  points: number | null;
  academicHours: number | null;
  category: CmeCategory;
  /** counts toward the 60% own-specialty share */
  inSpecialty: boolean;
  /** emergency medical care training (min 8 TIP required) */
  emergencyCare: boolean;
  /** practical hours within emergency care training (min 4 required) */
  practicalHours: number | null;
  /** nurses only: Reg. 630 point 26.3 topic, suggested by the parser; missing on older certificates (see lib/nurse.ts nurseTopicOf) */
  nurseTopic?: NurseTopic | null;
  /** approval / registration number printed on the certificate, if any */
  approvalId: string | null;
  /** ISO 3166-1 alpha-2 code ("LV", "LT"); certificates saved before Oct 2026 may hold an English name ("Latvia") */
  country: string | null;
  /** language the document is written in (ISO 639-1, lib/parse/language.ts); null when unknown or on older certificates */
  language?: string | null;
  /** the LĀB approved-TIP register looked up for a certificate with no points printed (lib/tipRegistry.ts) */
  tipLookup?: TipLookup | null;
  /** 0-1, share of the key fields (title, date, points) the parser found */
  confidence: number | null;
  /** 0-1 per key field: how sure the parser is of each value it filled in; null once the user saves, or on older certificates */
  fieldConfidence?: FieldConfidence | null;
  /** confirmed by the parser without the user (lib/parse/confidence.ts autoConfirmBlocks); cleared when the user saves */
  autoConfirmed?: boolean;
  /** sha256 of the uploaded file, to spot the same file uploaded twice */
  fileHash?: string | null;
  /** id of the earlier certificate this upload repeats (same file, or same date, title and organizer); not counted. Cleared when the user confirms it anyway. */
  duplicateOf?: string | null;
  /** JSON array of ParseNote; older certificates hold plain English text */
  parseNotes: string | null;
}

export type ParseNoteCode =
  | "pdfUnreadable"
  | "pdfScan"
  | "imageUnreadable"
  // the user uploaded a photo or scan the blurry-photo check flagged (p.reason: blurry, dark, bright, small, unreadable)
  | "imageBlurry"
  | "ocr"
  | "ects"
  | "foreignRatio"
  | "dailyCap"
  | "noPoints"
  | "noTitle"
  | "noDate"
  | "noCountry"
  | "multiplePoints"
  | "derivedPractical"
  | "derivedInterdisciplinary"
  | "derivedAbroad"
  | "derivedElearning"
  | "derivedLatvia"
  | "plainHours"
  | "checkBeforeConfirming"
  // added Oct 2026 with the parsing module
  | "pdfOcr"
  | "pointsSummed"
  | "courseTotal"
  | "lecturer"
  | "lowConfidence"
  // added Oct 2026 for documents that did not read
  | "masterClass"
  | "foreignLanguage"
  | "tipRegistry"
  | "tipCandidates"
  | "tipNoMatch";

/** One event in the LĀB approved-TIP register (is.arstubiedriba.lv/tip_list_approved) */
export interface RegistryEvent {
  /** "TIP2025/8456" */
  approvalId: string;
  title: string;
  /** YYYY-MM-DD, first and last listed day */
  start: string | null;
  end: string | null;
  /** every listed day, for series held on several separate days */
  days: string[];
  organizer: string;
  tip: number | null;
  /** LĀB lecture programme, "application:8456" */
  detailRef: string | null;
}

export interface TipCandidate extends RegistryEvent {
  /** 0-1, how well title, date and organizer agree with the certificate */
  score: number;
}

/**
 * match: one event fits (points filled in, the user confirms); ambiguous: up to 3 to pick from;
 * none: nothing in the register fits; error: the register could not be reached.
 */
export interface TipLookup {
  status: "match" | "ambiguous" | "none" | "error";
  candidates: TipCandidate[];
  checkedAt: string;
}

/** Fields the parser scores; the review panel marks those below the threshold */
export type ConfidenceField = "title" | "organizer" | "date" | "points" | "country";
export type FieldConfidence = Partial<Record<ConfidenceField, number>>;

/** A parser note as a code plus values, rendered through dict.parseNotes in the UI language */
export interface ParseNote {
  code: ParseNoteCode;
  p?: Record<string, string | number | boolean>;
}
