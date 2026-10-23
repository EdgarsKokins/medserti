// Seals and stamps beside the title, and organizers printed only as the header line (Oct 2026).
// Fictional certificates ("Paraugu" organisations, the Medserti demo files) as their text layers and OCR read them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCertificateText } from "../lib/parse";
import { findPoints } from "../lib/parse/points";
import { despace, makeText, sealLines } from "../lib/parse/text";
import { displayCase, findOrganizer } from "../lib/parse/title";

const profile = { specialty: "Ģimenes (vispārējās prakses) ārsts" };

// the text layer of a certificate with a round seal and no "Organizators:" line: the header is letter-spaced,
// and the seal's text is glued onto the points line
const SEAL_LAYER = `S I A PA R A U G U M E D I C Ī N A S A K A D Ē M I J A
Reģ. Nr. 00000000000 · Rīga
S E R T I F I K Ā T S
apliecina, ka
Dr. Anna Paraudze
ir piedalījusies tālākizglītības kursā
„Sirds mazspējas aktualitātes ģimenes ārsta praksē”
Norises datums: 14.03.2026.
Norises vieta: Rīga, Latvija
Piešķirti 8 TIPPARAUGU
MED.
AKADĒMIJA
Kursa vadītāja
Dr. med. Ilze Paraudziņa
Valdes loceklis
Jānis Paraugs`;

// the same certificate photographed: OCR puts the seal's words between the lines
const SEAL_OCR = `SIA PARAUGU MEDICĪNAS AKADĒMIJA
Reģ. Nr. 00000000000 - Rīga
—- PARAUGU
MED.
SERTIFIKATS oe
apliecina, ka
Dr. Anna Paraudze
ir piedalījusies tālākizglītības kursā
„Sirds mazspējas aktualitātes ģimenes ārsta praksē”
Norises datums: 14.03.2026.
Norises vieta: Rīga, Latvija
Piešķirti 8
AKADĒMIJA
PARAUGU
TIP
Kursa vadītāja Valdes loceklis`;

const RESUS_LAYER = `B I E D R Ī B A „ PA R A U G U N E AT L I E K A M Ā S PA L Ī D Z Ī B A S C E N T R S ”
Liepāja, Latvija
A P L I E C Ī B A
Ar šo tiek apliecināts, ka
Dr. Anna Paraudze
sekmīgi apguvusi apmācību programmu
„Neatliekamā medicīniskā palīdzība: pieaugušo atdzīvināšana un AED
lietošana”
Datums: 22.05.2025. – 23.05.2025.
Apjoms: 16 akadēmiskās stundas, t. sk. 4 praktiskās stundas
16 TIP
PARAUGU
NEATL.
PALĪDZĪBAS
CENTRS
Lektors
Dr. Pēteris Paraugs`;

const FORUM_LAYER = `B A LT I C D E M O C A R D I O L O G Y F O R U M
Tallinn, Estonia
CERTIFICATE OF ATTENDANCE
This is to certify that
Dr. Anna Paraudze
attended the scientific congress
“Baltic Demo Cardiology Forum 2025: Heart Failure and Arrhythmias”
Dates: 09.10.2025 – 10.10.2025
Venue: Tallinn, Estonia
12 CME credits
BALTIC
DEMO
FORUM
Congress President
Prof. Demo Example`;

// ---------- seals ----------

test("seal glued onto the points line: 8 TIP still found, the seal is not the organizer", () => {
  const r = parseCertificateText(SEAL_LAYER, profile);
  assert.equal(r.fields.points, 8);
  assert.equal(r.pointsKind, "printed");
  assert.equal(r.fields.date, "2026-03-14");
  assert.equal(r.fields.title, "Sirds mazspējas aktualitātes ģimenes ārsta praksē");
  // the letter-spaced header does not split into words found elsewhere: left empty, never "AKADĒMIJA"
  assert.equal(r.fields.organizer, "");
});

test("seal words between the value and TIP in OCR text", () => {
  assert.deepEqual(findPoints(makeText(SEAL_OCR)).value, 8);
  const r = parseCertificateText(SEAL_OCR, profile, { ocr: true });
  assert.equal(r.fields.points, 8);
  assert.equal(r.fields.organizer, "SIA Paraugu Medicīnas Akadēmija");
});

test("a four-line seal after the points: 16 TIP printed, organizer not the seal's last words", () => {
  const r = parseCertificateText(RESUS_LAYER, profile);
  assert.equal(r.fields.points, 16);
  assert.equal(r.pointsKind, "printed");
  assert.notEqual(r.fields.organizer, "PALĪDZĪBAS CENTRS");
  assert.equal(r.fields.organizer, "");
});

test("seal lines: broken capital fragments only", () => {
  assert.deepEqual([...sealLines(["Piešķirti 8 TIP", "PARAUGU", "MED.", "AKADĒMIJA", "Kursa vadītāja"])], [1, 2, 3]);
  assert.deepEqual([...sealLines(["—- PARAUGU", "MED.", "SERTIFIKATS oe"])], [0, 1]);
  // a logo split over two lines, a legal form, a heading and a points label are never seal text
  assert.equal(sealLines(["RĪGAS STRADIŅA", "UNIVERSITĀTE", "Sertifikāts"]).size, 0);
  assert.equal(sealLines(["PARAUGU", "SIA MED.", "AKADĒMIJA"]).size, 0);
  assert.equal(sealLines(["SERTIFIKĀTS", "APLIECINA", "8", "TIP"]).size, 0);
});

// ---------- header organizers ----------

test("header-only organizer in capitals, shown in normal case", () => {
  const ocr = SEAL_OCR.replace("Piešķirti 8\nAKADĒMIJA\nPARAUGU\nTIP", "Piešķirti 8 TIP");
  const o = findOrganizer(makeText(ocr));
  assert.equal(o.value, "SIA Paraugu Medicīnas Akadēmija");
  assert.ok(o.confidence >= 0.7 && o.confidence <= 0.9);
});

test("header-only forum named like the event: kept, letter-spaced header split into words", () => {
  const r = parseCertificateText(FORUM_LAYER, profile);
  assert.equal(r.fields.points, 12);
  assert.equal(r.fields.organizer, "Baltic Demo Cardiology Forum");
  // a name only the header rule found never reaches auto-confirm on its own
  assert.ok(r.fields.fieldConfidence!.organizer! < 0.9);
});

test("organizer labels and articles are stripped", () => {
  const body = "CERTIFICATE OF ATTENDANCE\nThis is to certify that\nDr. Anna Paraudze\nattended the course\n“Demo Heart Failure Course”\n";
  for (const line of ["Organiser: Baltic Demo Cardiology Society", "Organised by the Baltic Demo Cardiology Society", "Organizer: Baltic Demo Cardiology Society"])
    assert.equal(findOrganizer(makeText(`${body}${line}\n12 CME credits`)).value, "Baltic Demo Cardiology Society", line);
  assert.equal(findOrganizer(makeText("Сертификат\nОрганизатор: Demo Medical Society\n")).value, "Demo Medical Society");
  assert.equal(findOrganizer(makeText("Sertifikāts\nOrganizators: biedrība „Paraugu centrs”\n")).value, "biedrība „Paraugu centrs”");
});

test("displayCase: capitals only, short words kept", () => {
  assert.equal(displayCase("SIA PARAUGU MEDICĪNAS AKADĒMIJA"), "SIA Paraugu Medicīnas Akadēmija");
  assert.equal(displayCase("BIEDRĪBA „PARAUGU CENTRS”"), "Biedrība „Paraugu Centrs”");
  assert.equal(displayCase("UNIVERSITY OF TARTU"), "University of Tartu");
  assert.equal(displayCase("SIA „Med4U”"), "SIA „Med4U”");
  assert.equal(displayCase("RSU"), "RSU");
});

test("despace: only when every word is found elsewhere", () => {
  const vocab = new Set(["baltic", "demo", "cardiology", "forum"]);
  assert.equal(despace("B A LT I C D E M O C A R D I O L O G Y F O R U M", vocab), "BALTIC DEMO CARDIOLOGY FORUM");
  assert.equal(despace("S I A PA R A U G U M E D I C Ī N A S", vocab), null);
  assert.equal(despace("Baltic Demo Cardiology Forum", vocab), null);
});
