// The certificate's approval numbers checked in the LĀB register (lib/parse/register.ts, lib/tipRegistry.ts).
// No network: fictional rows, from a fictional page of the register.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCertificateText } from "../lib/parse";
import { applyRegister, checkRows, dateInRow, lectureNameOfRow, nameDistance, readCleanly } from "../lib/parse/register";
import { lookupNumbers, parseRegistryRows, resetRegisterState } from "../lib/tipRegistry";
import { autoConfirmBlocks } from "../lib/parse/confidence";
import { decideSpecialty } from "../lib/specialtyDecision";
import type { RegistryEvent } from "../lib/types";

const profile = { specialty: "Neirologs" };
const row = (o: Partial<RegistryEvent> & { approvalId: string }): RegistryEvent => ({ title: "Parauga lekcija", start: "2025-01-10", end: "2026-12-31", days: ["2025-01-10", "2026-12-31"], organizer: "AS Paraugfarm", audience: "Neirologs", tip: 1.3, detailRef: null, ...o });
const rows = (...list: RegistryEvent[]) => new Map(list.map((r) => [r.approvalId, [r]]));
const reads = (...ids: (string | [string, number])[]) => ids.map((x) => (typeof x === "string" ? { id: x, tip: null } : { id: x[0], tip: x[1] }));

// ----- the register's page -----

const td = (s: string) => `<td>${s}</td>`;
const PAGE = `<html><table><tbody><tr>${[
  '<span class="type-application">Pieteikums</span><br/><button data-type="application" data-id="1507"></button>',
  "TIP2025/1507", "09.10.2025", "", "Veselības skolas lekcija: Nakts miega iemesli.", "Ģimenes (vispārējās prakses) ārsts", "13.12.2025-11.12.2027", "Reāllaikā", "Parauga viesnīca", "60", "1.3",
  "\n<strong>AS Paraugfarm</strong><br/>\n<small>Anna Paraudze</small><br/>\n<small>+371 20000000</small><br/>\n<small>anna@example.com</small>\n",
].map(td).join("")}</tr></tbody></table></html>`;

test("register page: one row, a long range, and nothing of the contact person", () => {
  const [r] = parseRegistryRows(PAGE);
  assert.equal(r.approvalId, "TIP2025/1507");
  assert.equal(r.title, "Veselības skolas lekcija: Nakts miega iemesli.");
  assert.equal(r.start, "2025-12-13");
  assert.equal(r.end, "2027-12-11");
  assert.equal(r.tip, 1.3);
  assert.equal(r.organizer, "AS Paraugfarm");
  assert.doesNotMatch(JSON.stringify(r), /Paraudze|371|example\.com/);
});

// ----- what asks the register -----

test("lookupNumbers: one at a time, only the exact public number, only so many", async () => {
  resetRegisterState();
  const asked: string[] = [];
  let open = 0;
  const out = await lookupNumbers(["TIP2025/1111", "TIP2025/1111", "2025/2222", "PC-LV-123456", "10.05.2025", "TIP2025/3333"], async (id) => {
    assert.equal(++open, 1);
    asked.push(id);
    await new Promise((r) => setTimeout(r, 1));
    open--;
    return [row({ approvalId: id })];
  });
  assert.deepEqual(asked, ["TIP2025/1111", "TIP2025/3333"]);
  assert.deepEqual([...out!.keys()], ["TIP2025/1111", "TIP2025/3333"]);
});

test("lookupNumbers: a register that is down gives null, and is left alone after that", async () => {
  resetRegisterState();
  const original = console.error;
  console.error = () => {};
  let calls = 0;
  const down = async () => {
    calls++;
    throw new Error("offline");
  };
  assert.equal(await lookupNumbers(["TIP2025/1111", "TIP2025/2222"], down), null);
  assert.equal(calls, 1);
  assert.equal(await lookupNumbers(["TIP2025/3333"], down), null);
  assert.equal(calls, 1);
  console.error = original;
  resetRegisterState();
});

test("lookupNumbers: when the second number fails, the first stays", async () => {
  resetRegisterState();
  const original = console.error;
  console.error = () => {};
  const out = await lookupNumbers(["TIP2025/1111", "TIP2025/2222"], async (id) => {
    if (id.endsWith("2222")) throw new Error("slow");
    return [row({ approvalId: id })];
  });
  console.error = original;
  assert.deepEqual([...out!.keys()], ["TIP2025/1111"]);
  resetRegisterState();
});

// ----- the check -----

test("dateInRow: a range of two years, a list, a single day; the end day counts", () => {
  assert.equal(dateInRow(row({ approvalId: "x" }), "2026-06-01", null), true);
  assert.equal(dateInRow(row({ approvalId: "x" }), "2026-12-31", null), true);
  assert.equal(dateInRow(row({ approvalId: "x" }), "2027-01-01", null), false);
  assert.equal(dateInRow({ start: "2025-05-24", end: null, days: ["2025-05-24"] }, "2025-05-24", null), true);
  assert.equal(dateInRow({ start: "2025-05-24", end: null, days: ["2025-05-24"] }, "2025-05-25", null), false);
  assert.equal(dateInRow({ start: null, end: null, days: [] }, "2025-05-25", null), false);
});

const cert = { date: "2025-06-01", endDate: null, points: 2.6 };

test("check: two numbers add up to what is printed", () => {
  const c = checkRows(reads("TIP2025/1", "TIP2025/2"), rows(row({ approvalId: "TIP2025/1" }), row({ approvalId: "TIP2025/2" })), cert);
  assert.equal(c.accepted.length, 2);
  assert.deepEqual(c.rejected, []);
});

test("check: a date outside the row's dates rejects it, a number nobody knows too", () => {
  const c = checkRows(reads("TIP2025/1", "TIP2025/2"), rows(row({ approvalId: "TIP2025/1", start: "2023-01-01", end: "2023-02-01", days: [] })), { ...cert, points: 1.3 });
  assert.deepEqual(c.accepted, []);
  assert.deepEqual(c.rejected, [{ id: "TIP2025/1", reason: "date" }, { id: "TIP2025/2", reason: "notFound" }]);
});

test("check: TIP that does not agree rejects the row; another number's row that does agree stays", () => {
  assert.deepEqual(checkRows(reads("TIP2025/1"), rows(row({ approvalId: "TIP2025/1", tip: 4 })), { ...cert, points: 1.3 }).rejected, [{ id: "TIP2025/1", reason: "tip" }]);
  const c = checkRows(reads("TIP2025/1", "TIP2025/2"), rows(row({ approvalId: "TIP2025/1", tip: 4 }), row({ approvalId: "TIP2025/2", tip: 1.3 })), { ...cert, points: 1.3 });
  assert.deepEqual(c.accepted.map((r) => r.approvalId), ["TIP2025/2"]);
  assert.deepEqual(c.rejected, [{ id: "TIP2025/1", reason: "tip" }]);
});

test("check: a row with another number's filter hit is not this number's row", () => {
  const c = checkRows(reads("TIP2025/1"), new Map([["TIP2025/1", [row({ approvalId: "TIP2025/11" })]]]), { ...cert, points: 1.3 });
  assert.deepEqual(c.rejected, [{ id: "TIP2025/1", reason: "notFound" }]);
});

test("check: no date read means nothing to agree with", () => {
  const c = checkRows(reads("TIP2025/1"), rows(row({ approvalId: "TIP2025/1" })), { date: null, endDate: null, points: 1.3 });
  assert.deepEqual(c.rejected, [{ id: "TIP2025/1", reason: "noDate" }]);
});

test("check: one lecture's value read, the other's lost: the numbers still agree", () => {
  const c = checkRows(reads(["TIP2025/1", 1.3], "TIP2025/2"), rows(row({ approvalId: "TIP2025/1" }), row({ approvalId: "TIP2025/2" })), { ...cert, points: 1.3 });
  assert.equal(c.accepted.length, 2);
});

test("lectureNameOfRow: what only the register needs goes", () => {
  assert.equal(lectureNameOfRow("Veselības skolas lekcija: Nakts miega iemesli."), "Nakts miega iemesli");
  assert.equal(lectureNameOfRow("Veselības skolas lekcija:Miegs – kā palīdzēt?"), "Miegs - kā palīdzēt?");
  assert.equal(lectureNameOfRow("lekcija dr. Anna Paraudze “Stress un trauksme” lekcija pasākuma dienā"), "Stress un trauksme");
  assert.equal(lectureNameOfRow("Pavasara seminārs"), "Pavasara seminārs");
});

test("nameDistance: a misread name is close, a vague one is far", () => {
  assert.ok(nameDistance("IRDS VESELĪBAS SKOLA", "Sirds Veselības Skola") < 0.25);
  assert.ok(nameDistance("Pavasara seminārs ārstiem", "Pavasara seminārs") > 0.25);
});

// ----- on a certificate -----

const SCHOOL = `Ar šo sertifikātu apliecinām, ka ārsts/-e
12.01.2025. piedalījās
Paraugfarm organizētajā Paraugholina skolas
1. interaktīvajā nodarbībā un noklausījās lekcijas
“Elkona locitava -
intuitiva izmeklesana”
Dr. Anna Paraudze
1,3 TIP TIP2025/1401
“Elkona sindroms”
Dr. Ilze Parauga
1,3 TIP 2025/1402`;

test("a course stays the course: the register spells it and names the lectures, its number and organizer come through", () => {
  const read = parseCertificateText(SCHOOL, profile, { ocr: true });
  assert.equal(read.fields.title, "Paraugholina skolas 1. interaktīvā nodarbība");
  const r = applyRegister(read, rows(
    row({ approvalId: "TIP2025/1401", title: "Paraugholīna skolas lekcija: Elkoņa locītava – intuitīva izmeklēšana" }),
    row({ approvalId: "TIP2025/1402", title: "Paraugholīna skolas lekcija: Elkoņa sindroms" }),
  ));
  assert.equal(r.fields.title, "Paraugholīna skolas 1. interaktīvā nodarbība");
  assert.deepEqual(r.fields.lectures, [
    { name: "Elkoņa locītava - intuitīva izmeklēšana", tip: 1.3, approvalId: "TIP2025/1401" },
    { name: "Elkoņa sindroms", tip: 1.3, approvalId: "TIP2025/1402" },
  ]);
  assert.equal(r.fields.organizer, "AS Paraugfarm");
  assert.deepEqual(r.fields.approvalIds, ["TIP2025/1401", "TIP2025/1402"]);
  assert.equal(r.fields.points, 2.6);
  assert.match(r.notes ?? "", /registerChecked/);
});

// ----- the printed name stands when it was read cleanly -----

test("readCleanly: dictionary words, abbreviations, numbers, names, long terms the dictionary lacks", () => {
  for (const name of [
    "Vai kafija ietekmē miegu?",
    "AH riski un SGLT2 inhibitori 2025",
    "Trauksme - 21. gadsimta problēma",
    "Lekcija pēc Paraudža metodes",
    "Plaušu mikrotrombektomijas loma",
    "Dr. Paraudža padomi pacientu aprūpē",
  ]) assert.equal(readCleanly(name, name), true, name);
});

test("readCleanly: scraps, a capital inside a word, doubled letters, words glued together", () => {
  for (const name of ["Dzīve pēc slimības ogo ee 9", "Mazo s iedru slimība", "Veselības interakUvā nodarbība", "Pacientu apriipe praksē", "Pacienti ar bezmieguun sāpēm"])
    assert.equal(readCleanly(name, name), false, name);
});

test("readCleanly: a short word the dictionary lacks is clean when the text layer and OCR both read it", () => {
  assert.equal(readCleanly("Plaušu kvazo lietošana", "kvazo"), false);
  assert.equal(readCleanly("Plaušu kvazo lietošana", "kvazo\n\nkvazo"), true);
});

/** A certificate of one school with one lecture, as OCR read it */
const lectureCert = (lecture: string) => `Ar šo sertifikātu apliecinām, ka ārsts/-e
12.01.2025. piedalījās
Paraugfarm organizētajā Veselības skolas
1. interaktīvajā nodarbībā un noklausījās lekcijas
"${lecture}"
Dr. Anna Paraudze
1,3 TIP TIP2025/1401`;
const lectureAfter = (lecture: string, rowTitle: string) => applyRegister(parseCertificateText(lectureCert(lecture), profile, { ocr: true }), rows(row({ approvalId: "TIP2025/1401", title: rowTitle }))).fields.lectures?.[0];

test("a cleanly read lecture stays as printed when the register words it differently", () => {
  assert.equal(lectureAfter("Vai kafija ietekmē miegu?", "Veselības skolas lekcija: Vai diēta ietekmē miegu?")?.name, "Vai kafija ietekmē miegu?");
  assert.equal(lectureAfter("Vitamīni: labums un kaitējums", "Vitamīni: labums un iespējamais kaitējums")?.name, "Vitamīni: labums un kaitējums");
});

test("a register's typo never replaces a clean printed word", () => {
  assert.equal(lectureAfter("Terapeitiskie aspekti un profilakse", "Terapeotiskie aspekti un profilakse")?.name, "Terapeitiskie aspekti un profilakse");
});

test("points and number stay the accepted row's when the printed name stands", () => {
  const l = lectureAfter("Vai kafija ietekmē miegu?", "Vai diēta ietekmē miegu?");
  assert.equal(l?.approvalId, "TIP2025/1401");
  assert.equal(l?.tip, 1.3);
});

test("a garbled lecture takes the register's name", () => {
  assert.equal(lectureAfter("Dzīve pēc slimības ogo ee 9 no profilakses līdz terapijai", "Veselības skolas lekcija: Dzīve pēc slimības - no profilakses līdz terapijai")?.name, "Dzīve pēc slimības - no profilakses līdz terapijai");
  assert.equal(lectureAfter("Mazo s iedru slimība", "Mazo šķiedru slimība")?.name, "Mazo šķiedru slimība");
  assert.equal(lectureAfter("Veselības interakUvā nodarbība", "Veselības interaktīvā nodarbība")?.name, "Veselības interaktīvā nodarbība");
});

test("a garbled lecture keeps its read when the register's name is only the course's", () => {
  assert.equal(lectureAfter("Mazo s iedru slimība", "Seminārs Parauga centrā")?.name, "Mazo s iedru slimība");
});

test("lost letters come back from the row, word by word, and the printed words stay", () => {
  assert.equal(lectureAfter("Ka varam palidzet pacientiem ar kafiju?", "Kā varam palīdzēt pacientiem ar diētu?")?.name, "Kā varam palīdzēt pacientiem ar kafiju?");
  // a misread letter that makes no word, next to a real word within a slip of it
  assert.equal(lectureAfter("Plaušu slimības skaitjos", "Plaušu slimības skaitļos")?.name, "Plaušu slimības skaitļos");
});

test("a title: as printed when read cleanly, the register's when garbled", () => {
  const taking = (title: string) => `par piedalīšanos seminārā\n${title}\nLĀB Sertifikācijas padome ar dokumentu Nr. TIP2025/1538 apliecina 1.3 kredītpunktu\n2025. gada 25. martā`;
  const after = (title: string, rowTitle: string) => applyRegister(parseCertificateText(taking(title), profile), rows(row({ approvalId: "TIP2025/1538", title: rowTitle }))).fields.title;
  assert.equal(after("Kā praksē samazināt riskus?", "Kā praksē samazināt iespējamos riskus?"), "Kā praksē samazināt riskus?");
  assert.equal(after("Veselības interakUvā nodarbība praksē", "Veselības interaktīvā nodarbība praksē"), "Veselības interaktīvā nodarbība praksē");
});

test("a vague register name never replaces the certificate's own", () => {
  const text = `2025. gada 11. maijā piedalījās izglītojošā seminārā:\n11.00 un\nnoklausījās lekciju:\nDr. Paraudža padomi pacientu aprūpē Kurzemē\nDr. Anna Paraudze,\nkardiologs\nLĀB Sertifikācijas padome ar dokumentu Nr. TIP2025/1403 apliecina 1,3 TIP punktus`;
  const r = applyRegister(parseCertificateText(text, profile, { ocr: true }), rows(row({ approvalId: "TIP2025/1403", title: "Izglītojošs seminārs Parauga centrā" })));
  assert.equal(r.fields.title, "Dr. Paraudža padomi pacientu aprūpē Kurzemē");
});

test("the register's spelling of a title read with lost letters, not checked again", () => {
  const text = `SERTIFIKATS\npar piedalisanos seminara\nKa prakse samazinat AH riskus?\nLAB Sertifikacijas padome ar dokumentu Nr. TIP2025/1538 apliecina 1.3 kreditpunktu\n2025. gada 25. martā`;
  const r = applyRegister(parseCertificateText(text, profile), rows(row({ approvalId: "TIP2025/1538", title: "Kā praksē samazināt AH riskus?", start: "2025-02-03", end: "2026-02-01" })));
  assert.equal(r.fields.title, "Kā praksē samazināt AH riskus?");
});

test("a row that fails the check is not used: title, organizer and lectures stay, and a person is told when only the TIP differs", () => {
  const read = parseCertificateText(SCHOOL, profile, { ocr: true });
  const wrong = rows(row({ approvalId: "TIP2025/1401", title: "Cits pasākums", organizer: "SIA Cits", tip: 8 }), row({ approvalId: "TIP2025/1402", title: "Cits pasākums 2", organizer: "SIA Cits", tip: 8 }));
  const r = applyRegister(read, wrong);
  assert.equal(r.fields.title, read.fields.title);
  assert.equal(r.fields.organizer, read.fields.organizer);
  assert.deepEqual(r.fields.lectures, read.fields.lectures);
  assert.deepEqual(r.registered, []);
  assert.match(r.notes ?? "", /tipRegisterDiffers/);
  assert.ok((r.fields.fieldConfidence?.points ?? 1) < 0.7);
});

test("a register that is down changes nothing", () => {
  const read = parseCertificateText(SCHOOL, profile, { ocr: true });
  const r = applyRegister(read, null);
  assert.deepEqual(r.fields, read.fields);
  assert.equal(r.notes, read.notes);
});

test("no points printed: the register's sum, for a person to check, never auto-confirmed", () => {
  const text = `2025. gada 25. martā piedalījās seminārā\nPlaušu veselība praksē\nLĀB Sertifikācijas padome ar dokumentu Nr. TIP2025/1111`;
  const read = parseCertificateText(text, profile);
  assert.equal(read.fields.points, null);
  const r = applyRegister(read, rows(row({ approvalId: "TIP2025/1111", title: "Plaušu veselība praksē" })));
  assert.equal(r.fields.points, 1.3);
  assert.equal(r.pointsKind, "registry");
  assert.match(r.notes ?? "", /tipRegistry/);
  assert.doesNotMatch(r.notes ?? "", /noPoints/);
  assert.ok((r.fields.fieldConfidence?.points ?? 1) < 0.7);
  const blocks = autoConfirmBlocks({ source: r.source, pointsKind: r.pointsKind, fields: r.fields, window: { start: null, end: null }, existing: [], fileHash: null, today: "2025-06-01" });
  assert.ok(blocks.includes("pointsNotPrinted"));
});

test("a title or organizer from the register does not lift a certificate past auto-confirm", () => {
  const text = `SERTIFIKATS\npar piedalīšanos seminārā\nKā praksē samazināt riskus?\nLĀB Sertifikācijas padome ar dokumentu Nr. TIP2025/1538 apliecina 1.3 kredītpunktu\n2025. gada 25. martā`;
  const read = parseCertificateText(text, profile);
  const r = applyRegister(read, rows(row({ approvalId: "TIP2025/1538", title: "Kā praksē samazināt riskus?", organizer: "SIA Paraugs" })));
  assert.ok((r.fields.fieldConfidence?.organizer ?? 1) < 0.9);
  assert.ok(autoConfirmBlocks({ source: r.source, pointsKind: r.pointsKind, fields: r.fields, window: { start: null, end: null }, existing: [], fileHash: null, today: "2025-06-01" }).includes("unsure"));
});

test("an organizer cell holding a contact person is not an organizer; one the certificate has is kept whole", () => {
  const text = `par piedalīšanos seminārā\nKā praksē samazināt riskus?\nLĀB Sertifikācijas padome ar dokumentu Nr. TIP2025/1538 apliecina 1.3 kredītpunktu\n2025. gada 25. martā\nSeminārs organizēts ar PARAUGS atbalstu`;
  const person = applyRegister(parseCertificateText(text, profile), rows(row({ approvalId: "TIP2025/1538", title: "Kā praksē samazināt riskus?", organizer: "Anna Paraudze" })));
  assert.doesNotMatch(person.fields.organizer, /Paraudze/);
  const company = applyRegister(parseCertificateText(text, profile), rows(row({ approvalId: "TIP2025/1538", title: "Kā praksē samazināt riskus?", organizer: "Paraugs Latvia" })));
  assert.equal(company.fields.organizer, "Paraugs Latvia");
});

test("one number, many lectures: the number stays with the course, the certificate's list stays", () => {
  const text = `2025. gada 24. maijā piedalījās seminārā un noklausījās lekcijas:\nMIEGA TERAPIJAS IESPĒJAS\nDR. ANNA PARAUDZE\nSĀPJU TERAPIJAS IESPĒJAS\nDR. ILZE PARAUGA\nLĀB Sertifikācijas padome ar dokumentu Nr. TIP2025/1823 apliecina 2.0 TIP punktu`;
  const r = applyRegister(parseCertificateText(text, profile, { ocr: true }), rows(row({ approvalId: "TIP2025/1823", title: "Seminārs ārstiem", tip: 2 })));
  assert.equal(r.fields.title, "Miega terapijas iespējas");
  assert.deepEqual(r.fields.lectures?.map((l) => l.approvalId), [null, null]);
  assert.equal(r.fields.approvalId, "TIP2025/1823");
});

test("in the specialty: the audience of the rows that agreed, without another question", async () => {
  const base = { fields: { inSpecialty: false, title: "X", country: "LV", category: "training_latvia" }, content: "certificate", tipLookup: null } as never;
  const noLookup = async () => {
    throw new Error("no second question");
  };
  const yes = await decideSpecialty({ ...(base as object), registered: [row({ approvalId: "x", audience: "Neirologs; Algologs" })] } as never, "Neirologs", null, "", noLookup);
  assert.deepEqual(yes, { inSpecialty: true, inSpecialtyBy: "registry" });
  const no = await decideSpecialty({ ...(base as object), registered: [row({ approvalId: "x", audience: "Kardiologs" })] } as never, "Neirologs", null, "", noLookup);
  assert.deepEqual(no, { inSpecialty: false, inSpecialtyBy: null });
});
