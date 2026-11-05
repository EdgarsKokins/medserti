// Title and organizer cross-checked against the Latvian dictionary (Edgars' certificates, 05 Nov 2026: a title read as
// "... vésture, un kapéc mainas ..." and a meeting cut off at "Latvljas Lauku glmenes"). Fictional text, same shapes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCertificateText, parseLayerAndOcr } from "../lib/parse";
import { latvianChecker } from "../lib/parse/spelling";
import { formsLike } from "../lib/parse/lvDictionary";
import { autoConfirmBlocks } from "../lib/parse/confidence";

const profile = { specialty: "Kardiologs" };

/** A Latvian document with nothing to say about the words under test */
const DOC = "Sertifikats izsniegts par dalibu seminara. Piedalijas arsti, slimnicas darbinieki un citi specialisti. Saskana ar noteikumiem tiek pieskirti talakizglitibas punkti.";
const fix = (value: string, doc = DOC) => latvianChecker(doc)(value, "title");

test("two-level suffixes are words: verbal nouns get their own ending, not the reflexive one", () => {
  for (const w of ["lietošanas", "ārstēšanas", "gremošanas"]) assert.ok(formsLike(w).has(w), w);
  assert.equal(fix("Preparatu lietosanas pamati"), "Preparātu lietošanas pamati");
  assert.equal(fix("Slimibu arstesanas pieredze"), "Slimību ārstēšanas pieredze");
  assert.equal(fix("Sirds un gremosanas trakts"), "Sirds un gremošanas trakts");
});

test("the dictionary has no say over prefixes it does not allow, or stems that need an affix", () => {
  assert.ok(formsLike("nevēlams").has("nevēlams"));
  assert.ok(formsLike("jālieto").has("jālieto"));
  assert.ok(!formsLike("jāgaldam").has("jāgaldam"));
  assert.ok(!formsLike("aizrāpt").has("aizrāpt"));
});

test("our course titles choose between valid words, then fewest letters", () => {
  assert.equal(fix("Slimnicas kartiba"), "Slimnīcas kārtība");
  assert.equal(fix("Interaktivas lekcijas perspektiva"), "Interaktīvas lekcijas perspektīva");
});

test("a tie stays as it was: the dictionary cannot choose between endings", () => {
  assert.equal(fix("Apvienotaja seminara lekcijas"), "Apvienotaja semināra lekcijas");
});

test("document evidence first: the reading in the same place wins, even over a valid word", () => {
  const doc = `${DOC}\n"Kardiologijas vēsture un kāpēc mainās rekomendācijas? Praktiskie piemēri."`;
  assert.equal(fix("Kardiologijas vesture un kapec mainas rekomendacijas?", doc), "Kardioloģijas vēsture un kāpēc mainās rekomendācijas?");
});

test("a valid word stays when the other reading is somewhere else on the page", () => {
  const doc = `${DOC}\nKatru dienu mainās temperatura un spiediens.`;
  assert.equal(fix("Rekomendacijas mainas regulari", doc), "Rekomendācijas mainas regulāri");
});

test("an unknown word takes its reading from anywhere in the document", () => {
  const doc = `${DOC}\nSeminārā lektori stāstīja par reimatoloģiju.`;
  // without the document: "seminara" could be two forms, and the one in the document wins over usage
  assert.equal(fix("Lekcija seminara noslegums", doc), "Lekcija seminārā noslēgums");
});

test("without evidence a valid word is never touched", () => {
  assert.equal(fix("Kapec mainas rekomendacijas?"), "Kāpēc mainas rekomendācijas?");
});

test("stray accents go only when the result is a word", () => {
  assert.equal(fix("Sirds slimibu vésture"), "Sirds slimību vēsture");
  assert.equal(fix("Klīniskā vésturez"), "Klīniskā vésturez");
});

test("case stays: capitals stay capitals, Adobe's T is no capital", () => {
  assert.equal(fix("SIRDS SLIMTBU ARSTESANA"), "SIRDS SLIMĪBU ĀRSTĒŠANA");
  assert.equal(fix("Sirds slimTbu medicTna"), "Sirds slimību medicīnā");
  assert.equal(fix("KLlNISKA VITAMiNA LIETOSANA"), "KLĪNISKĀ VITAMĪNA LIETOŠANA");
});

test("short words and debris stay", () => {
  assert.equal(fix("Kas KATS reg jas mas usa lidz"), "Kas KATS reg jas mas usa lidz");
});

test("a capital mid-title that may be a surname stays; words our organizers use do not", () => {
  // valid words as common nouns, but written like surnames
  assert.equal(fix("Lekcija doktora Pavars pieredze"), "Lekcija doktora Pavars pieredze");
  assert.equal(fix("Sirds slimibas, lektors Pavars"), "Sirds slimības, lektors Pavars");
  // the document can still say so
  assert.equal(fix("Lekcija doktora Pavars pieredze", `${DOC}\nDr. Pavārs, kardiologs`), "Lekcija doktora Pavārs pieredze");
  const check = latvianChecker(DOC);
  assert.equal(check("Latvljas Sirds Asociacija", "organizer"), "Latvijas Sirds Asociācija");
  assert.equal(check("Gimenes Arstu Biedriba un Pavars", "organizer"), "Ģimenes Ārstu Biedrība un Pavars");
});

test("a real o stays, Adobe's small o for ā is read, and a capital O is never ā", () => {
  assert.equal(fix("Funkcionalo traucejumu ainava"), "Funkcionālo traucējumu ainava");
  assert.equal(fix("Latvijas orstu asociocijas sertifikocijas"), "Latvijas ārstu asociācijas sertifikācijas");
  assert.equal(fix("SIRDS KROTS"), "SIRDS KROTS");
});

test("a capital I read as l", () => {
  assert.equal(fix("Sirds lzdegsanas"), "Sirds Izdegšanas");
});

test("only Latvian documents and Latvian fields change", () => {
  const en = "This is to certify that the doctor attended the international conference on cardiology, held in Vienna. Medicina Praktika";
  assert.equal(fix("Medicina un kardiologija", en), "Medicina un kardiologija");
  assert.equal(fix("Praktiska kardiologija", "Настоящим подтверждается участие врача в конференции по кардиологии в клинике университета."), "Praktiska kardiologija");
  // an English title on a Latvian certificate
  assert.equal(fix("Modern Treatment of Arterial Hypertension", DOC), "Modern Treatment of Arterial Hypertension");
  const { fields } = parseCertificateText(`Certificate of attendance
This is to certify that Dr. Example Person participated in the course
Advanced Knee Surgery Medicina
held in Vienna, 12 March 2025. The course was organized by Example University Hospital. 12 CME credits.`, profile);
  assert.equal(fields.title, "Advanced Knee Surgery Medicina");
  assert.equal(fields.language, "en");
});

test("only the title and organizer change: dates, TIP and approval IDs stay as read", () => {
  const text = `SERTIFIKATS
Dr. Paraugs Janis 2024. gada 12. maija piedalijas seminara
"Sirds mazspejas terapija"
LAB Sertifikacijas padome ar dokumentu Nr. TIP2024/7205 apliecina 3.3 TIP talakizglitibas punktus.`;
  const { fields } = parseCertificateText(text, profile);
  assert.equal(fields.title, "Sirds mazspējas terapija");
  assert.equal(fields.date, "2024-05-12");
  assert.equal(fields.points, 3.3);
  assert.equal(fields.approvalId, "TIP2024/7205");
});

test("a scan with a layer and OCR: the OCR's stray accents do not reach the title, its valid letters do", () => {
  const layer = `SERTIFIKATS
Dr. Paraudzis, piedalijies/ -usies lekcija
Sirds slimibu vesture, un kapec mainas rekomendacijas?
LAB Sertifikacijas padome ar dokumentu Nr. TIP2024/7205 apliecina 2 TIP talakizglitibas punktus.`;
  const ocr = `SERTIFIKĀTS
Dr. Paraudzis, piedalijies/ -usies lekcijā
“Sirds slimību vésture, un kapéc mainās rekomendācijas?”
LAB Sertifikācijas padome ar dokumentu Nr. TIP2024/7205 apliecina 2 TIP tālākizglītības punktus.`;
  const { fields } = parseLayerAndOcr(layer, ocr, profile);
  assert.equal(fields.title, "Sirds slimību vēsture, un kāpēc mainās rekomendācijas?");
});

test("a meeting broken over lines: the whole body and sēde, the organizer in the nominative", () => {
  const text = `APLIECINAJUMS
Piedalijos
Latvljas Sirds
glmenes
arstu
asociacijas sede
PROGRAMMA:
IEKAISIGAS SLIMIBAS.
Prof. Paraugs, kardiologs
Rigo, 2024. gada 26. aprilis.
Saskana ar MK noteikumiem par dalibu sede tiek pieskirti 4 TIP talakizglitibas punktus.`;
  const { fields } = parseCertificateText(text, profile);
  assert.equal(fields.title, "Latvijas Sirds ģimenes ārstu asociācijas sēde");
  assert.equal(fields.organizer, "Latvijas Sirds ģimenes ārstu asociācija");
});

test("the OCR's 'sēdē' in that place does not turn the title back into a locative", () => {
  const layer = `Piedalijos
Latvijas Sirds
asociacijas sede
4 TIP talakizglitibas punktus, saskana ar noteikumiem.`;
  const ocr = `Piedalījos
Latvijas Sirds asociācijas sēdē
4 TIP tālākizglītības punktus, saskaņā ar noteikumiem.`;
  const { fields } = parseLayerAndOcr(layer, ocr, profile);
  assert.equal(fields.title, "Latvijas Sirds asociācijas sēde");
  assert.equal(fields.organizer, "Latvijas Sirds asociācija");
});

test("a field the check changed is not confirmed without a person", () => {
  const read = (title: string) => parseCertificateText(`SERTIFIKATS
Dr. Paraugs piedalijas SIA Paraugu Klinika organizetaja seminara
"${title}"
2024. gada 12. maija. Piešķirti 3 TIP talakizglitibas punkti. Nr. TIP2024/7205`, profile);
  const changed = read("Sirds mazspejas terapija");
  assert.equal(changed.fields.title, "Sirds mazspējas terapija");
  assert.ok(changed.fields.fieldConfidence!.title! < 0.9);
  assert.ok(changed.fields.fieldConfidence!.title! >= 0.7);
  const blocks = autoConfirmBlocks({ source: "text", pointsKind: "printed", fields: changed.fields, window: { start: null, end: null }, existing: [], fileHash: null, today: "2026-11-05" });
  assert.ok(blocks.includes("unsure"));
  assert.equal(read("Sirds mazspējas terapija").fields.fieldConfidence!.title, 0.9);
});
