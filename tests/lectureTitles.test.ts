// Several lectures on one certificate, each title in quotes with its speaker underneath; the first quote never closes
// (Kārlis Stirāns' test, October 2026: the title came out as OCR debris, then as the sponsor line).
// A fictional certificate with the same layout, as its text layer and as OCR read the photo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCertificateText } from "../lib/parse";

const profile = { specialty: "Neirologs" };
const TITLE = "D vitamīnu preparātu vēsture, un kāpēc mainās rekomendācijas? Praktiskie piemēri D vitamīna lietošanā";

const LAYER = `SERTIFIKĀTS
Dr. PARAUDZIS JĀNIS ir
piedalījies/ -usies
lekcijās
“D vitamīnu preparātu vēsture, un kāpēc mainās
rekomendācijas? Praktiskie piemēri D vitamīna lietošanā.
Dr. Anna Paraudze, internists, Paraugu klīnika.
“Pacienta un ārsta perspektīva sirds slimību ārstēšanā.”
Asoc.prof. Ilze Parauga, kardiologs, Paraugu slimnīca.
LĀB Sertifikācijas padome ar dokumentu Nr.TIP2024/6875 un Nr.TIP2024/7213
apliecina 2.3 TIP tālākizglītības punktus, kas saskaņā ar MK noteikumiem
Nr. 943 "Ārstniecības personu sertifikācijas kārtība" izmantojami ārstu
sertifikācijai un resertifikācijai.
Dr. Anna Paraudze
Dr. Ilze Parauga
Semināra atbalstītājs KRKA
Kroņauce, 2024. gada 29. maijs`;

// the photos above the heading read as quoted debris, and the curly quotes as straight ones
const OCR = `4 ļ A ģ wo "
~ ' "4 ļ A ģ wo" ,
${LAYER.replace(/[“”]/g, '"')}`;

test("several quoted lectures: the first title, cut at its speaker line", () => {
  const r = parseCertificateText(LAYER, profile);
  assert.equal(r.fields.title, TITLE);
  assert.equal(r.fields.points, 2.3);
  assert.equal(r.fields.date, "2024-05-29");
});

test("OCR debris between quote marks is not a title", () => {
  assert.equal(parseCertificateText(OCR, profile, { ocr: true }).fields.title, TITLE);
});

test("the sponsor line is neither the title nor the organizer", () => {
  const r = parseCertificateText(LAYER, profile);
  assert.doesNotMatch(r.fields.title ?? "", /atbalst|KRKA/);
  assert.doesNotMatch(r.fields.organizer ?? "", /KRKA/);
});
