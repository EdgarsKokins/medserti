export type CourseSource = "lab_tip" | "lab_courses" | "kursiarstiem" | "medicinaskursi" | "lumpii";

/** in_person: live in a venue; online_live: live stream; recorded: e-learning / recording; hybrid: live + recording */
export type CourseFormat = "in_person" | "online_live" | "recorded" | "hybrid";

/** event: dated one-off; ongoing: approved for a long period, run on request; recorded: e-learning / recording */
export type CourseKind = "event" | "ongoing" | "recorded";

export interface Course {
  id: string;
  kind: CourseKind;
  source: CourseSource;
  title: string;
  /** link to the source page (registration, purchase or listing) */
  url: string;
  /** YYYY-MM-DD; null for always-available recordings */
  startDate: string | null;
  endDate: string | null;
  /** YYYY-MM-DD, for recordings / distance learning */
  availableUntil: string | null;
  format: CourseFormat;
  /** venue as published, shortened */
  location: string | null;
  /** city name, "Online" for online events, null if unknown */
  city: string | null;
  tip: number | null;
  minutes: number | null;
  /** target audience as published, e.g. "Ģimenes ārsts"; empty = not stated */
  audience: string;
  /** "Visu specialitāšu ārsti" or similar */
  allSpecialties: boolean;
  organizer: string | null;
  /** LĀB approval number, e.g. TIP2026/9696 */
  approvalId: string | null;
  /** Annex 4 item, e.g. 2 */
  annexItem: number | null;
  /** e.g. "EUR 49,00"; null if unknown */
  price: string | null;
  free: boolean;
  /** LĀB lecture programme reference, "application:9696" or "publication:123" */
  detailRef?: string | null;
}

export interface Lecture {
  lecturer: string;
  /** first sentence / heading of the lecture, shortened */
  title: string;
  minutes: number | null;
}

export interface CourseDetails {
  ref: string;
  fetchedAt: string;
  lectures: Lecture[];
}

export interface SourceStatus {
  source: CourseSource;
  ok: boolean;
  count: number;
  error: string | null;
}

export interface CourseIndex {
  fetchedAt: string;
  courses: Course[];
  sources: SourceStatus[];
}

export const SOURCE_LABELS: Record<CourseSource, string> = {
  lab_tip: "LĀB apstiprinātie TIP pasākumi",
  lab_courses: "LĀB kursi",
  kursiarstiem: "kursiarstiem.lv",
  medicinaskursi: "medicinaskursi.lv",
  lumpii: "LUMPII",
};

export const SOURCE_URLS: Record<CourseSource, string> = {
  lab_tip: "https://is.arstubiedriba.lv/tip_list_approved",
  lab_courses: "https://is.arstubiedriba.lv/events/kursi/list",
  kursiarstiem: "https://kursiarstiem.lv/",
  medicinaskursi: "https://medicinaskursi.lv/",
  lumpii: "https://www.lumpii.lv/arstniecibas-personam/kursi",
};
