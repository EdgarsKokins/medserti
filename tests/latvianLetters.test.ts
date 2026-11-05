// A scan with both Adobe's text layer and our OCR: the layer drops Latvian letters and the OCR keeps most of them
// (Edgars' certificate, 05 Nov 2026: "Apvienotā zinatniskā konference, atzimejot ..."). Fictional text, same shape.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCertificateText, parseLayerAndOcr } from "../lib/parse";
import { fold, latvianSpeller } from "../lib/parse/text";

const profile = { specialty: "Gastroenterologs" };

const LAYER = `LAT\\llh'S
GASrROfNTEROLOGU
SERTIFIKATS
izsniegts
Dr. Paraudzis Janis, kurS
2024. gada 24. maija piedalTjas GREMOSANAS SLIMTBU BIEDRIBAS, LATVIJAS GASTROENTEROLOGUASOCIACIJAS
un LATVIJAS LAUKU GIMENES ARSTU ASOCIACIJAS
apvienotaja zinatniskaja
konference, atzimejot Pasaules Digestivas Veselibas un Pasaules Mikrobioma Dienas
un noklausijassekojosas lekcijas:
Zarnu mikrobiota funkcionalo gremosanas trakta slimibu konteksta.
LAB Sertifikacijas padome ar dokumentu Nr. TIP2024/7205 apliecina 3.3 TIP talakizglitibas punktus.`;

const OCR = `LATVIJAS o had 5 SN 2
GASTROENTEROLOGU GE % (os
ASOCIĀCIJA Ni Hr pamenes ©
izsniegts
Dr. Lx Za Leer, kurš
2024. gada 24. maija piedalijas GREMOSANAS SLIMIBU BIEDRIBAS, LATVIJAS GASTROENTEROLOGU
ASOCIACIJAS un LATVIJAS LAUKU ĢIMENES ĀRSTU ASOCIACIJAS apvienotajā zinātniskajā
konferencē, atzīmējot Pasaules Digestīvās Veselības un Pasaules Mikrobioma Dienas un noklausījās
sekojošas lekcijas:
Zarnu mikrobiota funkcionālo gremošanas trakta slimību kontekstā.
LAB Sertifikācijas padome ar dokumentu Nr. TIP2024/7205 apliecina 3.3 TIP tālākizglītības punktus.`;

test("the title and organizer get their Latvian letters back from the OCR", () => {
  const { fields } = parseLayerAndOcr(LAYER, OCR, profile);
  assert.equal(fields.title, "Apvienotā zinātniskā konference, atzīmējot Pasaules Digestīvās Veselības un Pasaules Mikrobioma Dienas");
  assert.equal(fields.organizer, "Gremošanas Slimību Biedrība, Latvijas Gastroenterologu Asociācija un Latvijas Lauku Ģimenes Ārstu Asociācija");
  assert.equal(fields.date, "2024-05-24");
  assert.equal(fields.points, 3.3);
  assert.equal(fields.approvalId, "TIP2024/7205");
});

test("spelling changes letters only: the same text once folded", () => {
  const spelled = latvianSpeller(OCR)(LAYER);
  assert.notEqual(spelled, LAYER);
  assert.equal(spelled.length, LAYER.length);
  assert.equal(fold(spelled).replace(/slimibu/g, "slimtbu"), fold(LAYER).replace(/slimibu/g, "slimtbu"));
});

test("case stays the layer's; Adobe's T inside a lowercase word is not a capital", () => {
  const spell = latvianSpeller("zinātniskajā slimību piedalījās atzīmējot");
  assert.equal(spell("ZINATNISKAJA"), "ZINĀTNISKAJĀ");
  assert.equal(spell("Zinatniskaja"), "Zinātniskajā");
  assert.equal(spell("zinatniskaja"), "zinātniskajā");
  assert.equal(spell("SLIMTBU"), "SLIMĪBU");
  assert.equal(spell("piedalTjas"), "piedalījās");
});

test("an ending comes only from the same place on the page, a stem from anywhere", () => {
  // both forms on the page, each stays in its place
  const both = latvianSpeller("konference zinātniskajā konferencē atzīmējot");
  assert.equal(both("konference zinatniskaja konference"), "konference zinātniskajā konferencē");
  // the OCR read it once and the layer twice: which one is which is unknown, so the ending stays
  assert.equal(latvianSpeller("zinātniskajā konferencē atzīmējot")("konference, konference"), "konference, konference");
  // the stem is the same in every form, even when the OCR lost the letters in another place
  const stem = latvianSpeller("SLIMIBU slimību zinātniskajā atzīmējot");
  assert.equal(stem("SLIMTBU"), "SLIMĪBU");
});

test("a word the OCR read differently, or has no spelling for, stays as it is", () => {
  const spell = latvianSpeller("zinātniskajā konferencē atzīmējot veselības");
  assert.equal(spell("Paraudzis TIP GASTROENTEROLOGU 3.3"), "Paraudzis TIP GASTROENTEROLOGU 3.3");
  assert.equal(spell("konference"), "konferencē");
  assert.equal(spell("konferencu"), "konferencu");
});

test("a letter the layer has is never lost or swapped", () => {
  const spell = latvianSpeller("kāzas ķēde šūna");
  assert.equal(spell("kazās"), "kazās");
  assert.equal(spell("ķede"), "ķēde");
});

test("an English certificate is left alone: stray macrons in its OCR are noise", () => {
  const ocr = "This certificate confirms that the doctor attended the annual surgery conference in Vienna and received Šurgery credits for the whole programme of the event";
  const layer = "Certificate of attendance, annual Surgery conference, Vienna";
  assert.equal(latvianSpeller(ocr)(layer), layer);
});

test("without OCR the layer is parsed as before, apart from the known head nouns", () => {
  const { fields } = parseCertificateText(LAYER, profile);
  assert.equal(fields.title, "Apvienotā zinatniskā konference, atzimejot Pasaules Digestivas Veselibas un Pasaules Mikrobioma Dienas");
  assert.match(fields.organizer ?? "", /Biedrība, Latvijas Gastroenterologu Asociācija/u);
});
