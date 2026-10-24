// Photo of a screen, title and organizer from a letterhead (24 Oct 2026 usability test). Run: npx tsx --test tests/screenPhoto.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { screenPhoto, uploadQuestion, classifyCertificate } from "../lib/parse/isCertificate";
import { findOrganizer, findTitle } from "../lib/parse/title";
import { makeText } from "../lib/parse/text";

// OCR of a phone photo of a laptop showing a PDF certificate; the participant's name is replaced
const SCREEN = `Edit View Go Tools Window Help - =
[Dv DemoTO-zzina-A-10623.pdt ( ādn Ho /
Salvu miD
Pieauguso neformalas izglītības iestāde ,Demo TD”
Reg. apl. Nr. 4300000000
Faktiskā adrese: Demo iela 9, Rīga, LV-1005
APLIECIBA
Nr. NIP/A 10523
ANNA PARAUDZE
piedalījās neformālās izglītības programmā
Neatliekamie stāvokļi medicīnā
un ieguva 8 (astoņus) tālākizglītības punktus
F1 F2 F3 F4 F5 Fé [2] Fa 9
S D F G H J K`;

test("a photo of a screen is recognised; a plain certificate is not", () => {
  assert.equal(screenPhoto(SCREEN), true);
  assert.equal(screenPhoto("APLIECĪBA\nANNA PARAUDZE\npiedalījās seminārā\n„Sirds mazspēja”\n8 TIP"), false);
  const q = uploadQuestion({ check: classifyCertificate(SCREEN, null, 81), issues: [], ocrConfidence: 81, text: SCREEN });
  assert.deepEqual(q, { kind: "quality", issues: ["screen"] });
  // the same words in a PDF's text layer are no photo
  assert.equal(uploadQuestion({ check: classifyCertificate(SCREEN, null, null), issues: [], ocrConfidence: null, text: SCREEN }), null);
});

test("'piedalījās neformālās izglītības programmā' is followed by the title", () => {
  assert.equal(findTitle(makeText(SCREEN)).value, "Neatliekamie stāvokļi medicīnā");
});

test("letterhead 'izglītības iestāde „Demo TD”' names the organizer", () => {
  assert.equal(findOrganizer(makeText("Pieaugušo neformālās izglītības iestāde „Demo TD”\nReg. Nr. 1\nAPLIECĪBA")).value, "Demo TD");
});
