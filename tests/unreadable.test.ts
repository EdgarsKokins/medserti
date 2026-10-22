// Documents that did not read (Oct 2026): turned photos, Russian letters, no TIP printed, master classes, foreign languages.
// Synthetic data only: the real certificates hold personal data and stay outside the repo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { looksMisreadCyrillic, ocrPages, readPage, type OcrEngine, type OcrLang } from "../lib/parse/ocr";
import { parseCertificateText } from "../lib/parse";
import { docLanguage, needsTranslation } from "../lib/parse/language";
import { makeText } from "../lib/parse/text";
import { applyTipLookup, matchTip, searchTerms, titleSimilarity } from "../lib/parse/tipMatch";
import { lookupTip, parseRegistryRows } from "../lib/tipRegistry";
import { autoConfirmBlocks, rowConfirmEligible } from "../lib/parse/confidence";
import { buildChecklist } from "../lib/export/docs";
import type { RegistryEvent } from "../lib/types";

const profile = { specialty: "Traumatoloģija un ortopēdija" };

// ---------- rotation and language ----------

const LATVIAN = "Sertifikāts apliecina ka Jānis Bērziņš piedalījās seminārā Aktualitātes traumatoloģijā un ortopēdijā Rīgā 2025. gada 10. oktobrī";
const SOUP = "HacTosmas cnpaska BbjaHa B TOM 4TO NpHrIAlleHHBIH Bpad YipHc Kacnape Xupypr TauikeHt PecnyGanka VaGexucran nepnoj mionst nous roņa pamkax npogeccHORanbHOTO Bir3uTa YAHBEpCHTETCKOM Kiikitke Medline Vipuc Kacmapc nposen ueThipe Macrep ksacc onepaumu HANpap IeHHbie MOBBINIEHHE KBATHGHKAIMH";
const RUSSIAN = "Настоящая справка выдана в том что приглашенный врач Иванов Иван хирург находился в городе Ташкент в период с 16 июня по 19 июня 2026 года провел 4 (четыре) мастер-класс-операции в Университетской клинике «Demo Clinic»";
const NOISE = "1 ; % = i | ! ~ ? 2 4 ' , . ; : 8 6 0 ( ) [ ] { } / \\ _ - + 3 5 7 9 # @ $ ^ & *";

/** A fake engine: the "image" is the text it holds when turned the right way; other turns read as noise */
function fakeEngine(upright: number, textFor: (lang: OcrLang) => string) {
  const calls: string[] = [];
  const engine: OcrEngine<number> = {
    pageCount: 1,
    render: async () => 0,
    rotate: async (img, deg) => (img + deg) % 360,
    recognize: async (img, lang = "lav") => {
      calls.push(`${img}:${lang}`);
      return img === upright ? { text: textFor(lang), confidence: lang === "rus" ? 80 : 75 } : { text: NOISE, confidence: 20 };
    },
  };
  return { engine, calls };
}

test("rotation: a page turned 90, 180 or 270 degrees is read the right way up", async () => {
  for (const upright of [0, 90, 180, 270]) {
    const { engine } = fakeEngine(upright, () => LATVIAN);
    const r = await readPage(engine, 0);
    assert.equal(r.rotation, upright);
    assert.equal(r.text, LATVIAN);
  }
});

test("rotation: an upright page is read once", async () => {
  const { engine, calls } = fakeEngine(0, () => LATVIAN);
  await ocrPages(engine);
  assert.deepEqual(calls, ["0:lav"]);
});

test("Russian: loaded only when the Latvian read is Cyrillic letter soup", async () => {
  const ru = fakeEngine(0, (lang) => (lang === "rus" ? RUSSIAN : SOUP));
  const r = await ocrPages(ru.engine);
  assert.equal(r.lang, "rus");
  assert.equal(r.text, RUSSIAN);
  const lv = fakeEngine(0, () => LATVIAN);
  await ocrPages(lv.engine);
  assert.ok(!lv.calls.some((c) => c.endsWith(":rus")), "a Latvian page never loads the Russian model");
});

test("Russian: a turned Russian page is turned first, then read in Russian", async () => {
  const { engine } = fakeEngine(270, (lang) => (lang === "rus" ? RUSSIAN : SOUP));
  const r = await readPage(engine, 0);
  assert.deepEqual([r.rotation, r.lang], [270, "rus"]);
});

test("looksMisreadCyrillic: letter soup yes, Latvian and English no", () => {
  assert.ok(looksMisreadCyrillic(SOUP));
  assert.ok(!looksMisreadCyrillic(LATVIAN.repeat(3)));
  assert.ok(!looksMisreadCyrillic("This certificate is awarded to Dr John Smith for attending the Advanced Knee Course held in Rome on 26 April 2026 OlainFarm KRisTaps ".repeat(2)));
});

// ---------- Russian heuristics ----------

test("Russian letter: dates, country, master-class title, organizer, no points calculated", () => {
  const r = parseCertificateText(RUSSIAN, profile, { ocr: true });
  const f = r.fields;
  assert.equal(f.date, "2026-06-16");
  assert.equal(f.endDate, "2026-06-19");
  assert.equal(f.country, "UZ");
  assert.equal(f.title, "Мастер-класс-операции (4)");
  assert.equal(f.organizer, "Demo Clinic");
  assert.equal(f.category, "lecture_or_publication");
  assert.equal(f.points, null);
  assert.equal(f.language, "ru");
  const codes = JSON.parse(r.notes!).map((n: { code: string }) => n.code);
  assert.ok(codes.includes("masterClass"));
  assert.ok(codes.includes("foreignLanguage"));
  assert.ok(!codes.includes("lecturer"), "the master-class note replaces the 'add your talk separately' note");
});

test("Russian points and hours: баллов, академических часов", () => {
  const a = parseCertificateText("Сертификат. Иванов Иван принял участие в конференции «Травматология 2026», 12 марта 2026 года, Рига. Начислено 6 баллов.", profile);
  assert.equal(a.fields.points, 6);
  assert.equal(a.fields.date, "2026-03-12");
  const b = parseCertificateText("Сертификат. Конференция «Ортопедия», Москва, 3 апреля 2025 г. Объем 8 академических часов.", profile);
  assert.equal(b.fields.academicHours, 8);
});

// ---------- document language ----------

test("docLanguage: LV, EN, RU, LT; bilingual LT + EN counts as English", () => {
  assert.equal(docLanguage(makeText(LATVIAN)), "lv");
  assert.equal(docLanguage(makeText("This is to certify that Dr John Smith attended the course and was awarded 6 hours of CME")), "en");
  assert.equal(docLanguage(makeText(RUSSIAN)), "ru");
  assert.equal(docLanguage(makeText("PAŽYMĖJIMAS. Jonas Jonaitis dalyvavo kvalifikacijos tobulinimo renginyje, 8 valandos")), "lt");
  assert.equal(docLanguage(makeText("PAŽYMĖJIMAS / CERTIFICATE. This is to certify that Jonas Jonaitis dalyvavo and attended the course of 8 hours")), "en");
  assert.ok(needsTranslation("ru") && needsTranslation("lt"));
  assert.ok(!needsTranslation("lv") && !needsTranslation("en") && !needsTranslation(null));
});

test("export checklist names the documents that may need a translation", () => {
  const cert = { number: "1", validUntil: "2027-06-01", specialty: "Traumatologs" };
  assert.ok(!buildChecklist(cert, 3, 0).includes("tulkojums"));
  const txt = buildChecklist(cert, 3, 0, undefined, ["Мастер-класс-операции (4)"]);
  assert.match(txt, /Apliecināts tulkojums latviešu valodā 1 dokumentam svešvalodā/);
  assert.match(txt, /Мастер-класс-операции \(4\)/);
});

// ---------- TIP lookup in the LĀB register ----------

const ev = (approvalId: string, title: string, days: string[], organizer: string, tip: number | null): RegistryEvent => ({
  approvalId, title, start: days[0] ?? null, end: days.length > 1 ? days[days.length - 1] : null, days, organizer, tip, detailRef: `application:${approvalId.split("/")[1]}`,
});
const REGISTER: RegistryEvent[] = [
  ev("TIP2025/1001", "2.konference \"Demo jaunumi plecu ķirurģijā un rehabilitācijā.\"", ["2025-10-10"], "Demo Partneri SIA", 4),
  ev("TIP2025/1002", "Demo jaunumi plecu ķirurģijā un rehabilitācijā.", ["2025-04-25"], "Demo Partneri SIA", 4),
  ev("TIP2024/1003", "Ceļa locītavas endoprotezēšana", ["2024-11-07"], "Citi SIA", 6),
  ev("TIP2023/1004", "Vienreizējs kurss par potītes artroskopiju", ["2023-05-11"], "Potīšu biedrība", 3),
];
const keys = (title: string, date: string | null, organizer = "", dateConfidence = 0.85) => ({ title, organizer, date, endDate: null, dateConfidence, text: "" });

test("titleSimilarity tolerates lost diacritics, endings and one OCR slip", () => {
  assert.ok(titleSimilarity("Demo jaunumi plecu kirurgija un rehabilitacija", REGISTER[1].title) >= 0.9);
  assert.ok(titleSimilarity("Demo jaunumi plecu kirurgija un rehabilitacjia", REGISTER[1].title) >= 0.6);
  assert.ok(titleSimilarity("Ceļa locītavas endoprotezēšana", REGISTER[0].title) < 0.45);
});

test("matchTip: title and date agree -> one match", () => {
  const r = matchTip(keys("Demo jaunumi plecu kirurgija un rehabilitacija", "2025-10-10"), REGISTER);
  assert.equal(r.status, "match");
  assert.equal(r.candidates[0].approvalId, "TIP2025/1001");
});

test("matchTip: same title run twice, no date -> both offered, nothing filled", () => {
  const r = matchTip(keys("Demo jaunumi plecu kirurgija un rehabilitacija", null), REGISTER);
  assert.equal(r.status, "ambiguous");
  assert.deepEqual(r.candidates.map((c) => c.approvalId).sort(), ["TIP2025/1001", "TIP2025/1002"]);
});

test("matchTip: title known but on another date -> offered, never filled", () => {
  const r = matchTip(keys("Demo jaunumi plecu kirurgija un rehabilitacija", "2026-01-15"), REGISTER);
  assert.equal(r.status, "ambiguous");
});

test("matchTip: a doubtful date does not rule events out", () => {
  const r = matchTip(keys("Demo jaunumi plecu kirurgija un rehabilitacija", "2026-01-15", "", 0.4), REGISTER);
  assert.equal(r.status, "ambiguous");
  assert.equal(r.candidates.length, 2);
});

test("matchTip: one-off event with no date matches only when the organizer agrees", () => {
  assert.equal(matchTip(keys("Vienreizējs kurss par potītes artroskopiju", null, "Potīšu biedrība"), REGISTER).status, "match");
  assert.equal(matchTip(keys("Vienreizējs kurss par potītes artroskopiju", null, ""), REGISTER).status, "ambiguous");
});

test("matchTip: unrelated title -> none", () => {
  assert.equal(matchTip(keys("Kardioloģijas aktualitātes ģimenes ārstiem", "2025-10-10"), REGISTER).status, "none");
});

test("applyTipLookup: a match fills points for the user to check, never auto-confirmed", () => {
  const parsed = parseCertificateText("SERTIFIKĀTS\nApliecina, ka Jānis Bērziņš\npiedalījās seminārā:\nDemo jaunumi plecu ķirurģijā un rehabilitācijā\nPar dalību seminārā tiek piešķirti TIP punkti.\nRīga, 10.10.2025", profile);
  assert.equal(parsed.fields.points, null);
  const lookup = matchTip(keys(parsed.fields.title, parsed.fields.date), REGISTER);
  const r = applyTipLookup(parsed, lookup);
  assert.equal(r.fields.points, 4);
  assert.equal(r.fields.approvalId, "TIP2025/1001");
  assert.equal(r.pointsKind, "registry");
  const codes = JSON.parse(r.notes!).map((n: { code: string }) => n.code);
  assert.ok(codes.includes("tipRegistry") && !codes.includes("noPoints"));
  const blocks = autoConfirmBlocks({ source: "text", pointsKind: r.pointsKind, fields: r.fields, window: { start: null, end: null }, existing: [], fileHash: null, today: "2026-10-22" });
  assert.ok(blocks.includes("pointsNotPrinted"));
  const row = rowConfirmEligible({ id: "x", status: "needs_review", ...r.fields, fileHash: null, duplicateOf: null }, [], { start: null, end: null }, "2026-10-22");
  assert.equal(row, false, "the in-row Apstiprināt button stays away: the user opens the panel and confirms");
});

test("title: the line after 'par dalību ... tiek piešķirti TIP punkti' is not the title", () => {
  const r = parseCertificateText("SERTIFIKĀTS\nAPLIECINA, KA\nJānis Paraugs\nPIEDALĪJĀS SEMINĀRĀ:\nDemo jaunumi plecu ķirurģijā\nPAR DALĪBU SEMINĀRĀ TIEK PIEŠĶIRTI TIP PUNKTI.\nDemo Partneri SIA\n10.10.2025", profile);
  assert.equal(r.fields.title, "Demo jaunumi plecu ķirurģijā");
});

test("applyTipLookup: ambiguous and none keep the points empty", () => {
  const parsed = parseCertificateText("SERTIFIKĀTS\npiedalījās seminārā:\nDemo jaunumi plecu ķirurģijā un rehabilitācijā\nPar dalību seminārā tiek piešķirti TIP punkti.", profile);
  assert.ok(parsed.fields.title);
  const amb = applyTipLookup(parsed, matchTip(keys(parsed.fields.title, null), REGISTER));
  assert.equal(amb.fields.points, null);
  assert.ok(JSON.parse(amb.notes!).some((n: { code: string }) => n.code === "tipCandidates"));
  const none = applyTipLookup(parsed, { status: "none", candidates: [], checkedAt: "" });
  assert.ok(JSON.parse(none.notes!).some((n: { code: string }) => n.code === "tipNoMatch"));
});

test("lookupTip: searches by the title's longest words; a register that is down gives status error", async () => {
  assert.deepEqual(searchTerms("Aktualitātes un jaunākie risinājumi traumatoloģijā un ortopēdijā"), ["traumato", "risinaju", "ortopedi"]);
  const asked: string[] = [];
  const r = await lookupTip(keys("Demo jaunumi plecu kirurgija un rehabilitacija", "2025-10-10"), async (term) => {
    asked.push(term);
    return REGISTER;
  });
  assert.equal(r?.status, "match");
  assert.ok(asked.length >= 1 && asked.length <= 3);
  const down = await lookupTip(keys("Demo jaunumi plecu kirurgija", null), async () => {
    throw new Error("offline");
  });
  assert.equal(down?.status, "error");
});

test("parseRegistryRows: reads a register row, drops contact details", () => {
  const td = (s: string) => `<td style="x">${s}</td>`;
  const html = `<table><tbody><tr>${[
    '<span>Pieteikums</span><button data-type="application" data-id="1001"></button>',
    "TIP2025/1001", "09.10.2025", "", "2.konference &#34;Demo jaunumi&#34;", "Traumatologs, ortopēds", "10.10.2025", "Reāllaikā", "Rīga", "180", "4.0",
    "<strong>Demo Partneri SIA</strong><br/><small>Anna Demo</small><br/><small>+371 20000000</small>",
  ].map(td).join("")}</tr></tbody></table>`;
  const [row] = parseRegistryRows(html);
  assert.deepEqual(row, { approvalId: "TIP2025/1001", title: '2.konference "Demo jaunumi"', start: "2025-10-10", end: null, days: ["2025-10-10"], organizer: "Demo Partneri SIA", tip: 4, detailRef: "application:1001" });
});
