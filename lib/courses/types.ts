export type CourseSource = "lab_tip" | "lab_courses" | "kursiarstiem" | "medicinaskursi" | "lumpii" | "lma" | "evisit";

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
  /**
   * Registration contact as published by LĀB for this event (organizer's contact person).
   * Only kept for upcoming events and only shown inside the opened course summary.
   */
  contact?: CourseContact | null;
  /** LĀB lecture programme reference, "application:9696" or "publication:123" */
  detailRef?: string | null;
}

export interface CourseContact {
  name: string | null;
  email: string | null;
  phone: string | null;
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

export const SOURCE_URLS: Record<CourseSource, string> = {
  lab_tip: "https://is.arstubiedriba.lv/tip_list_approved",
  lab_courses: "https://is.arstubiedriba.lv/events/kursi/list",
  kursiarstiem: "https://kursiarstiem.lv/",
  medicinaskursi: "https://medicinaskursi.lv/",
  lumpii: "https://www.lumpii.lv/arstniecibas-personam/kursi",
  lma: "https://www.masuasociacija.lv/konferences-seminari-kursi/",
  evisit: "https://www.evisit.eu/current-events/index",
};

/**
 * "Tikai bez maksas": only courses the source marks as free. No price published (most of LĀB's TIP list) is shown as
 * "Cena nav norādīta" and never counted as free: a 40 TIP course listed as free was not believed (usability test, 24 Oct 2026).
 */
export const freeForFilter = (c: Pick<Course, "price" | "free">) => c.free;

/** LMA's approval register (208 pages, no event dates): linked for nurses, not scraped */
export const LMA_REGISTER_URL = "https://www.masuasociacija.lv/talakizglitibas-programmu-registrs/";

/** For nurses: LMA's own list, or an audience that names nurses ("Māsas", "medicīnas māsas") */
export const isNurseCourse = (c: Pick<Course, "source" | "audience">) =>
  c.source === "lma" || /(?<![\p{L}])(?:mās(?:a|as|ām|u)|nurses?)(?![\p{L}])/iu.test(c.audience);

/**
 * What only an opened course needs: link, venue, approval, programme reference and registration contact.
 * The /courses list leaves these out of its rows and loads them per course (/api/courses/item) when one is opened.
 */
export type CourseExtra = Pick<Course, "url" | "location" | "approvalId" | "annexItem"> & {
  detailRef: string | null;
  contact: CourseContact | null;
};

export const courseExtra = (c: Course): CourseExtra => ({
  url: c.url,
  location: c.location,
  approvalId: c.approvalId,
  annexItem: c.annexItem,
  detailRef: c.detailRef ?? null,
  contact: c.contact ?? null,
});
