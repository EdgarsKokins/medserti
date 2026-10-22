import "server-only";
import { randomBytes } from "crypto";
import { getJson, putBytes, putJson, remove } from "../storage";
import { getUser, saveCertificates, saveUser } from "../db";
import bcrypt from "bcryptjs";
import { addYears, RULES } from "../rules";
import { formatDate } from "../format";
import type { CmeCategory, CmeCertificate, UserRecord } from "../types";
import { certificatePdf, wrap, type PdfLine } from "./pdf";
import { DEMO_USER_ID } from "./id";

/*
 * The public demo account (Dr. Jānis Paraugs). Everything here is synthetic.
 *
 * - No email index entry is written, so the account cannot be found by email: no password login, no password reset.
 * - The password hash is of 32 random bytes nobody knows. The only way in is POST /api/auth/demo.
 * - Writes are rejected centrally by requireWritableUser() in lib/auth.ts.
 *
 * Dates are relative to the day the demo is seeded, so Jānis is always about 3 years into his 5-year cycle.
 * seedDemo() runs on demo login when the data is missing, older than DEMO_MAX_AGE_DAYS, or from an older DEMO_VERSION.
 * resetDemo() wipes the account and seeds it again (POST /api/admin/demo-reset, from /admin).
 */

export { DEMO_USER_ID } from "./id";

/** Bump when the canonical data below changes: the next demo login re-seeds */
const DEMO_VERSION = 1;
const DEMO_MAX_AGE_DAYS = 30;
const MARKER = `users/${DEMO_USER_ID}/demo.json`;
type Marker = { version: number; seededAt: string };

const certId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

interface DemoCert {
  /** months after the certificate was issued */
  month: number;
  day: number;
  days?: number;
  title: string;
  organizer: string;
  orgLine: string;
  points: number;
  academicHours: number | null;
  category: CmeCategory;
  inSpecialty: boolean;
  emergencyCare?: boolean;
  practicalHours?: number;
  country: string;
  ects?: boolean;
  file: string;
}

/*
 * 10 certificates, 170 TIP of 250 in total, none above 8 TIP a day. 152 in the own specialty (60% of 250 = 150, met).
 * Emergency care 4 of 8 TIP and 2 of 4 practical hours: the dashboard shows what is missing.
 */
const CERTS: DemoCert[] = [
  { month: 2, day: 14, days: 2, title: "Ģimenes ārstu tālākizglītības konference: aktualitātes primārajā aprūpē", organizer: "Latvijas Ārstu biedrība", orgLine: "LATVIJAS ĀRSTU BIEDRĪBA", points: 12, academicHours: 12, category: "training_latvia", inSpecialty: true, country: "LV", file: "LAB_konference.pdf" },
  { month: 5, day: 8, days: 4, title: "Arteriālās hipertensijas diagnostika un ārstēšana ģimenes ārsta praksē", organizer: "Rīgas Stradiņa universitāte", orgLine: "RĪGAS STRADIŅA UNIVERSITĀTE · Tālākizglītības fakultāte", points: 32, academicHours: 32, category: "training_latvia", inSpecialty: true, country: "LV", file: "RSU_hipertensija.pdf" },
  { month: 8, day: 21, title: "Neatliekamā medicīniskā palīdzība pieaugušajiem: pamatpasākumi un defibrilācija", organizer: "Paula Stradiņa klīniskā universitātes slimnīca", orgLine: "PAULA STRADIŅA KLĪNISKĀ UNIVERSITĀTES SLIMNĪCA", points: 4, academicHours: 4, category: "training_latvia", inSpecialty: false, emergencyCare: true, practicalHours: 2, country: "LV", file: "PSKUS_neatliekama_palidziba.pdf" },
  { month: 11, day: 6, days: 3, title: "Cukura diabēta pacienta vadība primārajā veselības aprūpē", organizer: "Latvijas Universitāte", orgLine: "LATVIJAS UNIVERSITĀTE · Medicīnas un dzīvības zinātņu fakultāte", points: 18, academicHours: 18, category: "training_latvia", inSpecialty: true, country: "LV", file: "LU_diabets.pdf" },
  { month: 13, day: 17, days: 5, title: "Chronic disease management in primary care", organizer: "University of Tartu", orgLine: "UNIVERSITY OF TARTU · Faculty of Medicine", points: 6, academicHours: null, category: "training_abroad", inSpecialty: true, country: "EE", ects: true, file: "Tartu_chronic_disease.pdf" },
  { month: 16, day: 2, days: 2, title: "Antibakteriālo līdzekļu racionāla lietošana ambulatorajā praksē", organizer: "Rīgas Stradiņa universitāte", orgLine: "RĪGAS STRADIŅA UNIVERSITĀTE · Tālākizglītības fakultāte", points: 16, academicHours: 16, category: "e_learning", inSpecialty: true, country: "LV", file: "RSU_antibiotikas.pdf" },
  { month: 19, day: 12, days: 2, title: "Sirds mazspējas pacientu aprūpe: kardiologa un ģimenes ārsta sadarbība", organizer: "Paula Stradiņa klīniskā universitātes slimnīca", orgLine: "PAULA STRADIŅA KLĪNISKĀ UNIVERSITĀTES SLIMNĪCA", points: 16, academicHours: 16, category: "interdisciplinary_conference", inSpecialty: true, country: "LV", file: "PSKUS_sirds_mazspeja.pdf" },
  { month: 23, day: 9, days: 4, title: "Garīgā veselība primārajā aprūpē: depresija un trauksme", organizer: "Latvijas Universitāte", orgLine: "LATVIJAS UNIVERSITĀTE · Medicīnas un dzīvības zinātņu fakultāte", points: 28, academicHours: 28, category: "training_latvia", inSpecialty: true, country: "LV", file: "LU_gariga_veseliba.pdf" },
  { month: 27, day: 15, days: 3, title: "Bērnu veselības aprūpe ģimenes ārsta praksē", organizer: "Rīgas Stradiņa universitāte", orgLine: "RĪGAS STRADIŅA UNIVERSITĀTE · Tālākizglītības fakultāte", points: 24, academicHours: 24, category: "training_latvia", inSpecialty: true, country: "LV", file: "RSU_bernu_veseliba.pdf" },
  { month: 33, day: 20, days: 2, title: "Medicīnas ētika un komunikācija ar pacientu", organizer: "Latvijas Ārstu biedrība", orgLine: "LATVIJAS ĀRSTU BIEDRĪBA", points: 14, academicHours: 14, category: "training_latvia", inSpecialty: false, country: "LV", file: "LAB_etika.pdf" },
];

const NAME = "Jānis Paraugs";

const iso = (d: Date) => d.toISOString().slice(0, 10);
function plusMonths(isoDate: string, months: number, day: number): string {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  d.setUTCDate(day);
  return iso(d);
}
const plusDays = (isoDate: string, n: number) => iso(new Date(new Date(isoDate + "T00:00:00Z").getTime() + n * 86_400_000));

function pdfFor(c: DemoCert, start: string, end: string | null, n: number): Buffer {
  const when = end ? `${formatDate(start, "lv")} - ${formatDate(end, "lv")}` : formatDate(start, "lv");
  const reg = `PARAUGS-${start.slice(0, 4)}-${String(n).padStart(3, "0")}`;
  const titleLines = (t: string): PdfLine[] => wrap(t, 62).map((text, i) => ({ text, size: 17, bold: true, gap: i ? 0 : 6 }));
  const lines: PdfLine[] = c.ects
    ? [
        { text: c.orgLine, size: 12, bold: true },
        { text: "CERTIFICATE OF COMPLETION", size: 28, bold: true, gap: 30 },
        { text: "This is to certify that", size: 12, gap: 14 },
        { text: NAME, size: 22, bold: true },
        { text: "has successfully completed the course", size: 12, gap: 4 },
        ...titleLines(c.title),
        { text: `Dates: ${start} - ${end}   ·   Tartu, Estonia`, size: 12, gap: 14 },
        { text: `Credits: ${c.points} ECTS`, size: 12 },
        { text: `Registration no. ${reg}`, size: 12 },
      ]
    : [
        { text: c.orgLine, size: 12, bold: true },
        { text: "APLIECĪBA", size: 28, bold: true, gap: 30 },
        { text: "Apliecina, ka", size: 12, gap: 14 },
        { text: NAME, size: 22, bold: true },
        { text: "ir piedalījies tālākizglītības pasākumā", size: 12, gap: 4 },
        ...titleLines(c.title),
        { text: `Norises laiks: ${when}`, size: 12, gap: 14 },
        {
          text: `Apjoms: ${c.points} TIP (${c.academicHours} akadēmiskās stundas${c.practicalHours ? `, t. sk. ${c.practicalHours} praktiskās` : ""})`,
          size: 12,
        },
        { text: `TIP apstiprinājuma Nr. ${reg}`, size: 12 },
      ];
  return certificatePdf(lines, "PARAUGS", "PARAUGS / SAMPLE. Sintētisks Medserti demo dokuments, nav derīgs. Synthetic Medserti demo document, not valid.");
}

function buildUser(issued: string, seededAt: string, passwordHash: string): UserRecord {
  return {
    id: DEMO_USER_ID,
    email: "demo@medserti.invalid",
    passwordHash,
    createdAt: seededAt,
    profile: {
      fullName: NAME,
      profession: "doctor",
      specialty: "Ģimenes (vispārējās prakses) ārsts",
      specialtyCode: "57",
      certificationKind: "specialty",
      certificateNumber: "PARAUGS-00000",
      certificateIssued: issued,
      certificateExpires: addYears(issued, RULES.validityYears),
    },
  };
}

/** Write the canonical demo account. Safe to run twice: the same ids are overwritten. */
async function seedDemo(today = new Date()): Promise<void> {
  const seededAt = today.toISOString();
  // 3 years and a few days back, on the 1st of a month
  const issued = plusMonths(iso(today), -36, 1);
  await saveUser(buildUser(issued, seededAt, await bcrypt.hash(randomBytes(32).toString("hex"), 10)));
  const certs: CmeCertificate[] = [];
  for (const [i, c] of CERTS.entries()) {
    const id = certId(i + 1);
    const date = plusMonths(issued, c.month, c.day);
    const endDate = c.days && c.days > 1 ? plusDays(date, c.days - 1) : null;
    const filePath = `users/${DEMO_USER_ID}/files/${id}/${c.file}`;
    await putBytes(filePath, pdfFor(c, date, endDate, i + 1), "application/pdf");
    const cert: CmeCertificate = {
      id,
      userId: DEMO_USER_ID,
      fileName: c.file,
      filePath,
      contentType: "application/pdf",
      uploadedAt: new Date(new Date((endDate ?? date) + "T09:30:00Z").getTime() + 2 * 86_400_000).toISOString(),
      status: "confirmed",
      title: c.title,
      organizer: c.organizer,
      date,
      endDate,
      points: c.points,
      academicHours: c.academicHours,
      category: c.category,
      inSpecialty: c.inSpecialty,
      emergencyCare: !!c.emergencyCare,
      practicalHours: c.practicalHours ?? null,
      approvalId: `PARAUGS-${date.slice(0, 4)}-${String(i + 1).padStart(3, "0")}`,
      country: c.country,
      confidence: 1,
      parseNotes: c.ects ? JSON.stringify([{ code: "ects" }]) : null,
    };
    certs.push(cert);
  }
  // one manifest write for the lot
  await saveCertificates(certs);
  // the marker goes last: an interrupted seed is retried on the next login
  await putJson(MARKER, { version: DEMO_VERSION, seededAt } satisfies Marker);
}

/** Seed on demo login when the data is missing, stale or from an older version */
export async function ensureDemo(today = new Date()): Promise<void> {
  const [marker, user] = await Promise.all([getJson<Marker>(MARKER), getUser(DEMO_USER_ID)]);
  const ageDays = marker ? (today.getTime() - Date.parse(marker.seededAt)) / 86_400_000 : Infinity;
  if (marker && user && marker.version === DEMO_VERSION && ageDays < DEMO_MAX_AGE_DAYS) return;
  await resetDemo(today);
}

/** Wipe the demo account and write it again from the canonical data */
export async function resetDemo(today = new Date()): Promise<void> {
  await remove(`users/${DEMO_USER_ID}/`);
  await seedDemo(today);
}
