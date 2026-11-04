// Logos above the heading read as debris, and a joint conference with no name of its own (Edgars' certificate, 04 Nov 2026:
// the title came out as "a a pi oF ASOCIĀCIJA Ni Hr pamenes Cg YN izsniegts", the organizer as a cut-off piece of the sentence).
// A fictional certificate with the same wording, as its text layer and as OCR read two photos of it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCertificateText } from "../lib/parse";
import { fold, makeText } from "../lib/parse/text";
import { findOrganizer, findTitle } from "../lib/parse/title";

const profile = { specialty: "Gastroenterologs" };
const TITLE = "Apvienotā zinātniskā konference, atzīmējot Pasaules Digestīvās Veselības un Pasaules Mikrobioma Dienas";
const ORGANIZER = "Gremošanas Slimību Biedrība, Latvijas Gastroenterologu Asociācija un Latvijas Lauku Ģimenes Ārstu Asociācija";

const BODY = `Mikrobiota mūsdienās: sausais atlikums.
Asoc. prof. Anna Parauga
Mikrobiota un neiroloģija.
Prof. Jānis Paraugs
Ģimenes ārsts un mikrobiota.
Dr. Ilze Paraudze
LĀB Sertifikācijas padome ar dokumentu Nr. TIP2024/7205 apliecina 3.3 TIP tālākizglītības punktus, kas saskaņā ar MK noteikumiem
Nr. 943 "Ārstniecības personu sertifikācijas kārtība" izmantojami ārstu sertifikācijai un resertifikācijai.
Sēdes vadītāji:
Asoc. Prof. Anna Parauga Prof. Jānis Paraugs`;
const SENTENCE = `2024. gada 24. maijā piedalījās GREMOŠANAS SLIMĪBU BIEDRĪBAS, LATVIJAS GASTROENTEROLOGU
ASOCIĀCIJAS un LATVIJAS LAUKU ĢIMENES ĀRSTU ASOCIĀCIJAS apvienotajā zinātniskajā
konferencē, atzīmējot Pasaules Digestīvās Veselības un Pasaules Mikrobioma Dienas un noklausījās
sekojošas lekcijas:`;

const LAYER = `LATVIJAS
GASTROENTEROLOGU
ASOCIĀCIJA
SERTIFIKĀTS
izsniegts
Dr. Paraudzis Jānis, kurš
${SENTENCE}
${BODY}`;

// the photo behind the report: a stray quote mark in the logos, the heading lost, scraps of logo text on one line
const OCR_QUOTE = `"a a pi oF ASOCIĀCIJA Ni Hr pamenes Cg YN
izsniegts
Dr. Lx Za Leer, kurš
${SENTENCE}
${BODY}`;

// another photo: no quote marks, the logos over several lines, the heading lost
const OCR_LOGOS = `MOS, (74
LATVIJAS Sh EN 5 SN S
GASTROENTEROLOGU «83 2 %, 1 6
ASOCIĀCIJA © Y. 5 KR.
% 1 DS Pimeme+
Org” 0?
izsniegts
Dr. Lx Za Leer, kurš
${SENTENCE.replace("maijā piedalījās GREMOŠANAS SLIMĪBU BIEDRĪBAS", "maija piedalijas GREMOSANAS SLIMIBU BIEDRIBAS")}
${BODY}`;

// narrow lines, the head noun glued on: read from the first line naming an institution, this gave the reported organizer
const OCR_GLUED = `"a a pi oF
ASOCIĀCIJA Ni Hr
pamenes Cg YN
izsniegts
Dr. Lx Za Leer, kurš 2024. gada 24. maija piedalijas GREMOSANAS SLIMIBU
BIEDRIBAS, LATVIJAS GASTROENTEROLOGUASOCIACIJAS
un LATVIJAS LAUKU ĢIMENES ĀRSTU ASOCIACIJAS
apvienotajā zinātniskajā konferencē, atzīmējot Pasaules Digestīvās Veselības un Pasaules Mikrobioma Dienas un noklausījās
sekojošas lekcijas:
${BODY}`;

for (const [name, text, ocr] of [["text layer", LAYER, false], ["photo with a stray quote mark", OCR_QUOTE, true], ["photo with logos over several lines", OCR_LOGOS, true], ["photo with glued words", OCR_GLUED, true]] as const) {
  test(`joint conference, ${name}: title and organizer from the sentence`, () => {
    const r = parseCertificateText(text, profile, { ocr });
    assert.equal(r.fields.title, TITLE);
    // photos lose diacritics in places, and the parser does not guess them back
    assert.equal(fold(r.fields.organizer ?? ""), fold(ORGANIZER));
    if (!ocr) assert.equal(r.fields.organizer, ORGANIZER);
    assert.equal(r.fields.date, "2024-05-24");
    assert.equal(r.fields.points, 3.3);
    assert.equal(r.fields.approvalId, "TIP2024/7205");
  });
}

// ---------- the general rule, on other certificates topped by logos ----------

const COURSE = `SERTIFIKĀTS
izsniegts
Dr. Paraudzis Jānis, kurš
piedalījies tālākizglītības kursā
Sirds mazspējas aktualitātes
Piešķirti 8 TIP`;

test("a stray quote mark in the logos never runs on into the heading or 'izsniegts'", () => {
  for (const logos of ['"a a pi oF ASOCIĀCIJA Ni Hr', '"PARAUGU ĀRSTU BIEDRĪBA', '“Paraugu klīnika un centrs'])
    assert.equal(findTitle(makeText(`${logos}\n${COURSE}`)).value, "Sirds mazspējas aktualitātes", logos);
});

test("'izsniegts' under the heading is not part of a title, quoted or not", () => {
  const noHeading = COURSE.replace("SERTIFIKĀTS\n", "");
  assert.equal(findTitle(makeText(`"Paraugu vārdi logo tekstā\n${noHeading}`)).value, "Sirds mazspējas aktualitātes");
  assert.equal(findTitle(makeText(`"Paraugu vārdi logo tekstā izsniegts"\n${noHeading}`)).value, "Sirds mazspējas aktualitātes");
});

test("a body's name in quote marks above the sentence is the letterhead", () => {
  assert.equal(findTitle(makeText(`"Paraugu Ārstu Biedrība"\n${COURSE}`)).value, "Sirds mazspējas aktualitātes");
});

test("an event's name in quote marks above the sentence stays the title", () => {
  const text = `„Paraugu kardioloģijas konference 2024”\n${COURSE}`;
  assert.equal(findTitle(makeText(text)).value, "Paraugu kardioloģijas konference 2024");
});

test("scraps are not a title; a short-worded title is", () => {
  assert.equal(findTitle(makeText("piedalījies kursā\na a pi oF ASOCIĀCIJA Ni Hr pamenes Cg YN\n8 TIP")).value, "");
  assert.equal(findTitle(makeText("piedalījies kursā\nKo darīt, ja ir AH?\n8 TIP")).value, "Ko darīt, ja ir AH?");
});

// ---------- the sentence ----------

test("an event with a name of its own keeps it", () => {
  const named = "piedalījās Paraugu biedrības un Paraugu asociācijas apvienotajā konferencē\n„Sirds mazspējas aktualitātes”\n8 TIP";
  assert.equal(findTitle(makeText(named)).value, "Sirds mazspējas aktualitātes");
});

test("masculine event nouns; who organized it stays out of the title", () => {
  const seminar = "piedalījās SIA Paraugu klīnika organizētajā praktiskajā seminārā un noklausījās lekcijas:\nSirds.\n8 TIP";
  assert.equal(findTitle(makeText(seminar)).value, "Praktiskais seminārs");
});

test("a piece of a sentence is never the organizer", () => {
  for (const line of ["BIEDRIBAS, LATVIJAS GASTROENTEROLOGUASOCIACIJAS", "ASOCIACIJAS un LATVIJAS LAUKU ĀRSTU ASOCIACIJAS", "un LATVIJAS LAUKU ĀRSTU ASOCIACIJAS", "a a pi oF ASOCIĀCIJA Ni Hr pamenes Cg YN"])
    assert.equal(findOrganizer(makeText(`SERTIFIKĀTS\n${line}\n8 TIP`)).value, "", line);
});
