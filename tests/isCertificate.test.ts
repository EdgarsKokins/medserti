/* "Is this a certificate?" (lib/parse/isCertificate.ts). Run with: npm test
 * The weights were calibrated outside the repo on the 47 real certificates (personal data, never committed): none is flagged.
 * Here: synthetic certificate texts in LV/EN/RU, the OCR output of 43 synthetic non-certificates (memes, receipts, a menu,
 * emails, chats, invoices, tickets, landscapes; tests/fixtures/non-certificates.json, no personal data), the order of the
 * upload questions, and what the server and the confirm rules do with a file uploaded anyway. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { classifyCertificate, countWords, uploadQuestion, type CertificateCheck } from "@/lib/parse/isCertificate";
import { parseCertificate, parseCertificateText, withContent } from "@/lib/parse";
import { autoConfirmBlocks, contentFlag, rowConfirmEligible } from "@/lib/parse/confidence";
import type { QualityIssue } from "@/lib/parse/imageQuality";

const kind = (text: string, conf: number | null = null) => classifyCertificate(text, null, conf).kind;

const CERTIFICATES: Record<string, string> = {
  lv: `SERTIFIKĀTS
Ar šo sertifikātu apliecinām, ka ārsts Jānis Paraugs
piedalījās seminārā "Aktuāli jautājumi kardioloģijā"
Rīgā, 2025. gada 14. martā
Piešķirti 3 TIP punkti (TIP2025/1234)
Latvijas Kardiologu biedrība`,
  // OCR of a scan: diacritics lost, words split
  lvOcr: `SERTIFIKATS
Ar so sertifikatu apliecinam, ka arsts/-e
piedalijas lekcija "Sirds mazspeja"
2024. gada 2. junija
Talakizglitibas punktu skaits 2`,
  en: `CERTIFICATE OF ATTENDANCE
This is to certify that Alex Example
has attended the 5th Baltic Orthopaedic Congress
Vilnius, 12-13 September 2025
The congress is accredited with 12 European CME credits (ECMEC)`,
  ru: `СЕРТИФИКАТ
Настоящим подтверждается, что врач Иван Образцов
принял участие в конференции «Современная хирургия»
г. Рига, 10 октября 2025 года, 6 часов`,
  // a letter of appreciation is in the real set too: no event words, but an award and a specialty
  award: `Novada pašvaldība
Atzinības raksts
Traumatologam-ortopēdam
par nesavtīgu darbu un profesionalitāti
2025. gada 20. novembrī`,
  // a course flyer / programme: kept as a certificate on purpose (it documents a course; it names a fee and an invoice)
  flyer: `Arthroscopic Live Surgery Days
Dates: 17.10-18.10.2024
Venue: University Hospital
Conference language: English
The course addresses advanced techniques of shoulder arthroscopic surgeries for established surgeons.
Course fee 250 EUR surgeons, doctors. The fee must be paid upon receipt of invoice.`,
};

for (const [name, text] of Object.entries(CERTIFICATES)) {
  test(`certificate: ${name}`, () => {
    const c = classifyCertificate(text);
    assert.equal(c.kind, "certificate", `${name}: score ${c.score} ${c.signals.join(" ")}`);
  });
}

test("certificate: a good certificate stays one even with low OCR confidence (the blurry check speaks then)", () => {
  assert.equal(kind(CERTIFICATES.lvOcr, 30), "certificate");
});

const NOT_CERTIFICATES: Record<string, string> = {
  memeEn: "ONE DOES NOT SIMPLY\nUPLOAD A MEME TO THE APP",
  memeDoctor: "WHEN THE PATIENT SAYS\nHE ALREADY GOOGLED IT",
  memeLv: "KAD PIRMDIENAS RĪTĀ\nATCERIES PAR ATSKAITI",
  memeRu: "КОГДА ПРИШЁЛ НА РАБОТУ\nА ТАМ ОПЯТЬ СОВЕЩАНИЕ",
  receipt: "VEIKALS PIE STŪRA\nČeks Nr. 0042\nPiens 1L 1,29\nMaize 1,85\nKOPĀ EUR 3,14\nPVN 21% 0,55\n2026-10-14 18:42\nPaldies par pirkumu!",
  // "TIP 6.00" is a tip, not TIP points
  restaurant: "THE HARBOUR GRILL\nTable 7\n2 x Fish and chips 29.00\nSubtotal 29.00\nVAT 20% 4.83\nTIP 6.00\nTOTAL 35.00\n14/10/2026",
  invoiceClinic: "INVOICE 2026-0457\nDate: 12 October 2026\nNorthside Family Clinic\nConsultation, general practitioner 45.00\nTotal due: EUR 45.00",
  email: "From: Mark\nSubject: Office move next week\nHi all, quick reminder that we move to the new office on Monday. Please pack your desks by Friday.",
  boarding: "BOARDING PASS\nFrom RIGA (RIX) To TALLINN (TLL)\nFlight XY 123 Date 14OCT\nGate A12 Seat 14A",
};

for (const [name, text] of Object.entries(NOT_CERTIFICATES)) {
  test(`not a certificate: ${name}`, () => {
    const c = classifyCertificate(text, null, 80);
    assert.equal(c.kind, "notCertificate", `${name}: score ${c.score} ${c.signals.join(" ")}`);
  });
}

test("no text: empty, scraps, or photo noise read with low confidence", () => {
  assert.equal(kind(""), "noText");
  assert.equal(kind("a m | ee = Ls"), "noText");
  assert.equal(kind("Mn tay Nu Im mw\nSo a RAE yrs BH NE Ke En Pi Sah FR RARE OR", 29), "noText");
  // the same scraps at a confidence real text has: text, but not a certificate
  assert.equal(kind("Mn tay Nu Im mw\nSo a RAE yrs BH NE Ke En Pi Sah FR RARE OR", 80), "notCertificate");
});

test("acronyms count only as units: an OCR'd name 'Dr CMe' is not CME", () => {
  assert.ok(!classifyCertificate("izdots DR CMe Mer").signals.some((s) => s.startsWith("credit")));
  assert.ok(classifyCertificate("8 CME credits").signals.some((s) => s.startsWith("credit")));
  assert.ok(classifyCertificate("16 ECTS").signals.some((s) => s.startsWith("credit")));
  assert.ok(classifyCertificate("piešķirti 4 TIP").signals.some((s) => s.startsWith("credit")));
});

test("countWords: real words count, OCR scraps do not", () => {
  assert.equal(countWords("Ar šo sertifikātu apliecinām"), 4);
  assert.equal(countWords("mMwN ee m | Ls"), 0);
});

test("43 synthetic non-certificates, as the real OCR read them: none is a certificate, all are asked about", () => {
  const rows: { file: string; text: string; ocrConfidence: number | null; issues: QualityIssue[] }[] = JSON.parse(
    readFileSync(new URL("./fixtures/non-certificates.json", import.meta.url), "utf8"),
  );
  assert.equal(rows.length, 43);
  for (const r of rows) {
    const check = classifyCertificate(r.text, null, r.ocrConfidence);
    assert.notEqual(check.kind, "certificate", `${r.file}: score ${check.score} ${check.signals.join(" ")}`);
    const q = uploadQuestion({ check, issues: r.issues, ocrConfidence: r.ocrConfidence, text: r.text });
    assert.ok(q, `${r.file}: not asked about`);
  }
  // most get the content message; smooth, dark or blank pictures get the photo one (see the order test)
  const content = rows.filter((r) => {
    const q = uploadQuestion({ check: classifyCertificate(r.text, null, r.ocrConfidence), issues: r.issues, ocrConfidence: r.ocrConfidence, text: r.text });
    return q?.kind === "noText" || q?.kind === "notCertificate";
  });
  assert.ok(content.length >= 36, `content message for ${content.length} of 43`);
});

// ---- the order of the questions ----

const check = (k: CertificateCheck["kind"]): CertificateCheck => ({ kind: k, score: 0, words: 0, signals: [] });
const GOOD_TEXT = "x".repeat(200).replace(/x/g, "a");

test("order 1: a certificate with a photo problem: the photo message (blurry before OCR, or low OCR confidence after)", () => {
  assert.deepEqual(uploadQuestion({ check: check("certificate"), issues: ["blurry"], ocrConfidence: 80, text: GOOD_TEXT }), { kind: "quality", issues: ["blurry"] });
  assert.deepEqual(uploadQuestion({ check: check("certificate"), issues: [], ocrConfidence: 30, text: GOOD_TEXT }), { kind: "quality", issues: ["unreadable"] });
  assert.equal(uploadQuestion({ check: check("certificate"), issues: [], ocrConfidence: 80, text: GOOD_TEXT }), null);
  // a PDF text layer has no OCR confidence
  assert.equal(uploadQuestion({ check: check("certificate"), issues: [], ocrConfidence: null, text: "short" }), null);
});

test("order 2: a photo check failed before OCR: the photo message, whatever the text looks like", () => {
  // a shaken certificate reads as scraps that look like no certificate at all
  assert.deepEqual(uploadQuestion({ check: check("notCertificate"), issues: ["blurry"], ocrConfidence: 66, text: "x" }), { kind: "quality", issues: ["blurry"] });
  assert.deepEqual(uploadQuestion({ check: check("noText"), issues: ["dark"], ocrConfidence: 10, text: "" }), { kind: "quality", issues: ["dark"] });
});

test("order 3: a fine photo with real text that is no certificate: 'not a certificate', not 'blurry'", () => {
  assert.deepEqual(uploadQuestion({ check: check("notCertificate"), issues: [], ocrConfidence: 80, text: GOOD_TEXT }), { kind: "notCertificate" });
  // a short meme caption would fail the "too few letters" OCR check; that check is for certificates only
  assert.deepEqual(uploadQuestion({ check: check("notCertificate"), issues: [], ocrConfidence: 60, text: "ONE DOES NOT SIMPLY" }), { kind: "notCertificate" });
});

test("order 4: a fine photo with no text: 'no text found'", () => {
  assert.deepEqual(uploadQuestion({ check: check("noText"), issues: [], ocrConfidence: 20, text: "" }), { kind: "noText" });
});

// ---- the server: second line of defence ----

const profile = { specialty: "Kardiologs" };

test("server: a meme photo uploaded anyway gets the note first and its content verdict", async () => {
  const r = await parseCertificate(Buffer.from("x"), "image/jpeg", profile, NOT_CERTIFICATES.restaurant, 80);
  assert.equal(r.content, "notCertificate");
  assert.equal(JSON.parse(r.notes!)[0].code, "notCertificate");
});

test("server: a short meme caption (too short to parse) is still 'not a certificate', not 'no text'", async () => {
  const r = await parseCertificate(Buffer.from("x"), "image/jpeg", profile, "WHEN THE PATIENT SAYS\nHE ALREADY GOOGLED IT", 75);
  assert.equal(r.content, "notCertificate");
  assert.deepEqual(JSON.parse(r.notes!).map((n: { code: string }) => n.code), ["notCertificate", "imageUnreadable"]);
});

test("server: a certificate photo is judged a certificate, with no extra note", async () => {
  const r = await parseCertificate(Buffer.from("x"), "image/jpeg", profile, CERTIFICATES.lv, 85);
  assert.equal(r.content, "certificate");
  assert.ok(!(JSON.parse(r.notes ?? "[]") as { code: string }[]).some((n) => n.code === "notCertificate" || n.code === "noText"));
});

test("server: OCR that read almost nothing is 'no text' (replacing 'could not read'); no OCR text at all is not judged", async () => {
  const some = await parseCertificate(Buffer.from("x"), "image/png", profile, "a m |", 12);
  assert.equal(some.content, "noText");
  assert.deepEqual(JSON.parse(some.notes!).map((n: { code: string }) => n.code), ["noText"]);
  const none = await parseCertificate(Buffer.from("x"), "image/png", profile, null);
  assert.equal(none.content, undefined);
  assert.deepEqual(JSON.parse(none.notes!).map((n: { code: string }) => n.code), ["imageUnreadable"]);
  // the browser's claim fills in only then (the upload route)
  assert.equal(withContent(none, "noText").content, "noText");
});

// ---- never confirmed for the user ----

test("a record flagged by the check is never auto-confirmed and never row-confirm eligible", () => {
  const r = parseCertificateText(CERTIFICATES.lv, profile);
  const base = {
    source: "text" as const,
    pointsKind: "printed",
    fields: { ...r.fields, fieldConfidence: { title: 1, organizer: 1, date: 1, points: 1 } },
    window: { start: null, end: null },
    existing: [],
    fileHash: null,
    today: "2025-12-01",
  };
  assert.deepEqual(autoConfirmBlocks(base), []);
  assert.deepEqual(autoConfirmBlocks({ ...base, content: "notCertificate" }), ["notCertificate"]);
  assert.deepEqual(autoConfirmBlocks({ ...base, content: "noText" }), ["notCertificate"]);

  const cert = {
    id: "a",
    status: "needs_review" as const,
    title: "Seminārs",
    organizer: "Biedrība",
    date: "2025-03-14",
    points: 3,
    fieldConfidence: { date: 0.95, points: 0.95 },
    fileHash: null,
    duplicateOf: null,
  };
  const win = { start: null, end: null };
  assert.equal(rowConfirmEligible({ ...cert, parseNotes: null }, [], win, "2025-12-01"), true);
  const flagged = { ...cert, parseNotes: JSON.stringify([{ code: "notCertificate" }, { code: "ocr" }]) };
  assert.equal(rowConfirmEligible(flagged, [], win, "2025-12-01"), false);
  assert.equal(contentFlag(flagged.parseNotes), "notCertificate");
  assert.equal(contentFlag("plain text note from an old record"), null);
});
