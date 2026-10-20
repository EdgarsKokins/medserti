export type Profession =
  | "doctor"
  | "dentist"
  | "functional_specialist"
  | "physician_assistant"
  | "nurse"
  | "midwife"
  | "other_practitioner";

export type CertificationKind = "specialty" | "method";

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: string;
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
  /** Manual override of required points, null = use the rule */
  requiredPointsOverride: number | null;
}

/** Annex 4 of Cabinet Regulation No. 391 grouped into the buckets that matter for counting */
export type CmeCategory =
  | "professional_meeting" // Annex 4 item 1
  | "training_latvia" // item 2, 5, 6, 8
  | "training_abroad" // item 3
  | "interdisciplinary_conference" // item 4, 4.1
  | "e_learning" // item 7, 9
  | "practical_training" // item 10, capped at 16%
  | "lecture_or_publication" // items 22-26
  | "degree" // items 11-12
  | "other";

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
  /** approval / registration number printed on the certificate, if any */
  approvalId: string | null;
  /** ISO 3166-1 alpha-2 code ("LV", "LT"); certificates saved before Oct 2026 may hold an English name ("Latvia") */
  country: string | null;
  /** 0-1, share of the key fields (title, date, points) the parser found */
  confidence: number | null;
  /** JSON array of ParseNote; older certificates hold plain English text */
  parseNotes: string | null;
}

export type ParseNoteCode =
  | "pdfUnreadable"
  | "pdfScan"
  | "imageUnreadable"
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
  | "checkBeforeConfirming";

/** A parser note as a code plus values, rendered through dict.parseNotes in the UI language */
export interface ParseNote {
  code: ParseNoteCode;
  p?: Record<string, string | number | boolean>;
}
