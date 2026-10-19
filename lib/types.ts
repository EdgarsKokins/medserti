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
  profile: Profile;
}

export interface Profile {
  fullName: string;
  profession: Profession;
  /** e.g. "Family medicine", "Orthopaedics" */
  specialty: string;
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
  country: string | null;
  /** 0-1, model's confidence in the extraction */
  confidence: number | null;
  parseNotes: string | null;
}

export const PROFESSION_LABELS: Record<Profession, string> = {
  doctor: "Doctor",
  dentist: "Dentist",
  functional_specialist: "Functional specialist",
  physician_assistant: "Physician assistant",
  nurse: "Nurse",
  midwife: "Midwife",
  other_practitioner: "Other medical practitioner",
};

export const CATEGORY_LABELS: Record<CmeCategory, string> = {
  professional_meeting: "Professional society meeting",
  training_latvia: "Training event in Latvia",
  training_abroad: "Training event abroad",
  interdisciplinary_conference: "Interdisciplinary conference",
  e_learning: "E-learning course",
  practical_training: "Supervised practical training",
  lecture_or_publication: "Lecture or publication",
  degree: "Academic degree",
  other: "Other",
};
