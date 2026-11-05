// The layouts of Latvian certificates (Edgars' scans, November 2026), each as a fictional copy: made-up names, titles and
// numbers, shaped the way a scanner's text layer and our OCR read them. One course plus its lectures, and every approval number.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCertificateText, parseLayerAndOcr } from "../lib/parse";
import { canonicalApproval, findApprovalNumbers } from "../lib/parse/approvals";
import { findPoints } from "../lib/parse/points";
import { makeText } from "../lib/parse/text";

const profile = { specialty: "Neirologs" };
const ids = (s: string) => findApprovalNumbers(makeText(s)).map((n) => n.id);
const names = (r: ReturnType<typeof parseCertificateText>) => (r.fields.lectures ?? []).map((l) => l.name);

// ----- approval numbers -----

test("approval numbers: every way they are printed", () => {
  for (const [text, want] of [
    ["TIP2025/1234", ["TIP2025/1234"]],
    ["TIP 2025/1234", ["TIP2025/1234"]],
    ["ar dokumentu Nr. 2025/417 apliecina", ["TIP2025/417"]],
    ["1,3 TIP 2025/1234", ["TIP2025/1234"]],
    ["1,3TIP\n2025/1234", ["TIP2025/1234"]],
    ["Sertifikācijas padomes lēmums 2025/1683", ["TIP2025/1683"]],
    ["TIP2025/1111; TIP2025/2222", ["TIP2025/1111", "TIP2025/2222"]],
    ["Nr.TIP2025/1111 un Nr.TIP2025/2222", ["TIP2025/1111", "TIP2025/2222"]],
    ["TIP2025/1403apliecina 1,3 TIP", ["TIP2025/1403"]],
    ["Nr. TIP2025/\n1403 apliecina", ["TIP2025/1403"]],
  ] as const) assert.deepEqual(ids(text), want, text);
});

test("approval numbers: dates, product codes, school years and laws are not numbers", () => {
  for (const text of ["10.05.2025.", "PC-LV-123456", "12/05/2025", "2025/05/12", "2025/2026 mācību gadā", "2025/26. mācību gads", "Regula (ES) 2016/679", "Nr. 943", "LV2025/100001"])
    assert.deepEqual(ids(text), [], text);
});

test("approval numbers: a letter OCR printed for a digit gets the likely digit, a layer and OCR of one number count once", () => {
  assert.deepEqual(ids("Nr. TIP2025/145S apliecina"), ["TIP2025/1455"]);
  assert.deepEqual(ids("TIP2025/1455 apliecina\n\nTIP2025/145S apliecina"), ["TIP2025/1455"]);
  assert.equal(canonicalApproval("tip2025/64o5"), "TIP2025/6405");
});

test("points: one lecture read twice with a misread number is not two lectures", () => {
  const t = makeText("LĀB padome ar dokumentu Nr. TIP2025/1455 apliecina2.\n7 TIP punktus\n\nLĀB padome ar dokumentu Nr. TIP2025/145S apliecina\n2.7 TIP punktus");
  assert.equal(findPoints(t).value, 2.7);
});

test("approval numbers: the value printed right before a number belongs to it", () => {
  assert.deepEqual(findApprovalNumbers(makeText("1,3TIP TIP2025/1111\nDr. A\n1.0 TIP 2025/2222")), [{ id: "TIP2025/1111", tip: 1.3 }, { id: "TIP2025/2222", tip: 1 }]);
});

// ----- layouts -----

const SPONSORED_OCR = `VENTSPILĪ, 2025. GADA 3. SEPTEMBRĪ
SERTIFIKATS
izdots DR Xml a NN
par piedalīšanos seminārā
Plaušu veselības ceļi jauniem pacientiem.
Kā izvēlēties?
eee
LĀB Sertifikācijas padome ar dokumentu Nr. TIP2025/417 apliecina 1.3 medicīniskās tālākizglītības
kredītpunktu iegūšanu, kas saskaņā ar „Nolikumu par ārstu speciālistu sertifikāciju Latvijā” izmantojami ārstu
sertifikācijai un resertifikācijai.
Dr. Anna Paraudze |
Seminars organizets ar "F PARAUGU PHARMA atbalstu :`;

test("sponsor layout: the title between 'par piedalīšanos seminārā' and LĀB, never the sponsor line", () => {
  const r = parseCertificateText(SPONSORED_OCR, profile, { ocr: true });
  assert.equal(r.fields.title, "Plaušu veselības ceļi jauniem pacientiem. Kā izvēlēties?");
  assert.equal(r.fields.points, 1.3);
  assert.equal(r.fields.approvalId, "TIP2025/417");
  assert.doesNotMatch(r.fields.title, /atbalst|PHARMA/);
});

test("sponsor line in OCR quotes is not a title even without the sentence", () => {
  const r = parseCertificateText(`SERTIFIKATS\nSeminars organizets ar "F PARAUGU PHARMA atbalstu\nRīgā, 2025. gada 3. maijā`, profile, { ocr: true });
  assert.doesNotMatch(r.fields.title, /atbalst/);
});

const QUOTED_LAYER = `SERTIFIKATS
PIEDALIJAS SEMINARA
"SVARIGI JAUT.AJUMI GIMENES ARSTA SKATIJUM.A"
SIRDS MAZSPEJAS DIAGNOSTIKA UN
ARSTESANA
DR. ANNA PARAUDZE, PARAUGU AUSTRUMU KLINISKAS
UNIVERSITATES SLIMNICAS KLlNIKA "PARAUGS"
MUGURAS SAPJU SINDROMS PRAKSE
DR. ILZE PARAUGA, PARAUGU KONSULTACIJAS SIA
LAB Sertifikacijas padome ar dokumentu Nr. TIP2025/1455 apliecina2.
7 TIP
talakizglTtTbas punktus
2025.GADA 24.NOVEMBRIS
RIGA`;
const QUOTED_OCR = `PIEDALĪJĀS SEMINĀRĀ
«SVARĪGI JAUTĀJUMI ĢIMENES ĀRSTA SKATĪJUMĀ”
SIRDS MAZSPĒJAS DIAGNOSTIKA UN
ĀRSTĒŠANA
DR. ANNA PARAUDZE, PARAUGU AUSTRUMU KLĪNISKĀS
UNIVERSITĀTES SLIMNĪCAS KLĪNIKA “PARAUGS”
MUGURAS SĀPJU SINDROMS PRAKSĒ
DR. ILZE PARAUGA, PARAUGU KONSULTĀCIJAS SIA
LĀB Sertifikācijas padome ar dokumentu Nr. TIP2025/145S apliecina
2.7 TIP tālākizglītības punktus, kas saskaņā ar MK noteikumiem
2025.GADA 24.NOVEMBRIS |
RIGA |`;

test("quoted seminar with lectures in capitals: the seminar is the title, two lectures, no speaker's workplace, TIP not doubled", () => {
  const r = parseLayerAndOcr(QUOTED_LAYER, QUOTED_OCR, profile);
  assert.equal(r.fields.title, "Svarīgi jautājumi ģimenes ārsta skatījumā");
  assert.equal(r.fields.points, 2.7);
  assert.equal(r.fields.approvalId, "TIP2025/1455");
  assert.deepEqual(names(r), ["Sirds mazspējas diagnostika un ārstēšana", "Muguras sāpju sindroms praksē"]);
});

test("stray dots of a scanner's layer leave a clean title", () => {
  assert.equal(parseCertificateText(QUOTED_LAYER, profile).fields.title, "Svarīgi jautājumi ģimenes ārsta skatījumā");
});

const SCHOOL_OCR = `SERTIFIKATS
Ar šo sertifikātu apliecinām, ka ārsts/-e
JĀNIS PARAUDZIS
12.01.2025. piedalījās
Paraugfarm organizētajā Veselības skolas
3. interaktīvajā nodarbībā un noklausījās lekcijas
“Elkoņa locītava —
° Gg = ° — — Lu ° 9
intuitīva un instrumentālā izmeklēšana”
Dr. Anna Paraudze
1,3 TIP TIP2025/1401
“Elkoņa sindroms —
no injekcijas līdz operatīvai terapijai”
Dr. med. Ilze Parauga
Neirologs, Paraugu centrs
1,3 TIP 2025/1402 D
SEY
ABCDE FGH 7
Paraugfarm Le EA SR`;

test("school layout: the sentence names the course in the nominative, lectures with their points and numbers, no stamp text", () => {
  const r = parseCertificateText(SCHOOL_OCR, profile, { ocr: true });
  assert.equal(r.fields.title, "Veselības skolas 3. interaktīvā nodarbība");
  assert.equal(r.fields.points, 2.6);
  assert.deepEqual(r.fields.approvalIds, ["TIP2025/1401", "TIP2025/1402"]);
  assert.deepEqual(r.fields.lectures, [
    { name: "Elkoņa locītava - intuitīva un instrumentālā izmeklēšana", tip: 1.3, approvalId: "TIP2025/1401" },
    { name: "Elkoņa sindroms - no injekcijas līdz operatīvai terapijai", tip: 1.3, approvalId: "TIP2025/1402" },
  ]);
});

test("school layout in a scanner's layer: words glued to digits and speakers still give the course", () => {
  const layer = `SERTI
KATS
Ar so sertifikatu apliecinam, ka arsts/-e
13.12.2025. piedalijas
Paraugfarm organizetaja Veselibas skolas7.
interaktivaja nodarbiba
un
noklausijas lekcijas
''Nakts miega iemesli''Dr.
Anna Paraudze
1,3 TIP
2025/1507
''Vai kafija ietekme miegu?''Dr.
Ilze Parauga
1,3 TIP 2025/1506`;
  const r = parseCertificateText(layer, profile);
  assert.equal(r.fields.title, "Veselības skolas 7. interaktīvā nodarbība");
  assert.deepEqual(r.fields.approvalIds, ["TIP2025/1507", "TIP2025/1506"]);
  assert.equal(r.fields.lectures?.length, 2);
});

for (const [sentence, want] of [
  ["pavasara seminārā ārstiem un noklausījās lekciju", "Pavasara seminārs ārstiem"],
  ["VESELĪBAS FORUMĀ\nun noklausījās lekcijas", "Veselības forums"],
  ["seminārā\nPLAUŠU AKADĒMIJA\nun noklausījās lekcijas", "Plaušu akadēmija"],
  ["VESELĪBAS AKADĒMIJĀ\n\nTukuma Centrālajā Bibliotēkā, Tukumā\n\n|\n\nun noklausījās lekcijas:", "Veselības akadēmija"],
  ["VESELĪBAS AKADĒMIJAS II cikla lekciju ciklā\nMUGURAS SĀPES\nun noklausījās lekcijas", "Veselības akadēmijas II cikla lekciju cikls: Muguras sāpes"],
  ["seminārā „Sirds veselība” un noklausījās lekciju", "Sirds veselība"],
  ["ikgadējā kongresā un noklausījās lekcijas", "Ikgadējā kongress"],
] as const) {
  test(`organised sentence: "${want}"`, () => {
    const text = `Ar šo sertifikātu apliecinām, ka ārsts/-e\n02.06.2025. piedalījās Paraugfarm organizētajā ${sentence}\nPirmā lekcija par miegu\nDr. Anna Paraudze\nPar dalību seminārā piešķirti 1.3 TIP`;
    assert.equal(parseCertificateText(text, profile, { ocr: true }).fields.title, want);
  });
}

test("organised sentence: a logo over the first letter of a heading in capitals", () => {
  for (const heading of ["~IRDS VESELIBAS SKOLA", "MRDS VESELĪBAS SKOLA"]) {
    const text = `19.03.2025.\npiedalījās Paraugfarm organizētajā seminārā |\n3\n~ Pb 4 |\n${heading}\n|\nun noklausījās lekcijas\nPirmā lekcija par miegu\nDr. Anna Paraudze`;
    assert.equal(parseCertificateText(text, profile, { ocr: true }).fields.title, "Sirds veselības skola", heading);
  }
});

test("organised sentence that names nothing: the first lecture is the title", () => {
  const text = `02.06.2025. piedalījās Paraugfarm organizētajā seminārā un noklausījās lekcijas\nMiega higiēna ikdienā\nDr. Anna Paraudze\n1,3 TIP 2025/1111\nVai kafija ietekmē miegu?\nDr. Ilze Parauga\n1,3 TIP 2025/2222`;
  const r = parseCertificateText(text, profile, { ocr: true });
  assert.equal(r.fields.title, "Miega higiēna ikdienā");
  assert.equal(r.fields.lectures?.length, 2);
});

const SEMINAR_DR = `SERTIFIKATS
Šis sertifikāts apliecina, ka ārsts/-e
piedalījās izglītojošā seminārā:
2025. gada 11. maijā
11.00— 12.00 un
noklausījās lekciju:
Dr. Paraudža padomi pacientu aprūpē Kurzemē
Dr. Anna Paraudze,
kardiologs, Paraugu reģ.slimnīca
LĀB Sertifikācijas padome ar dokumentu Nr. TIP2025/1403 apliecina 1,3 TIP
tālākizglītības punktus
PC-LV-123456
10.05.2025.`;

test("unnamed seminar: 'izglītojošā seminārā:' is no name, a lecture starting with 'Dr.' is the title when the next line is its speaker", () => {
  const r = parseCertificateText(SEMINAR_DR, profile, { ocr: true });
  assert.equal(r.fields.title, "Dr. Paraudža padomi pacientu aprūpē Kurzemē");
  assert.equal(r.fields.approvalId, "TIP2025/1403");
  assert.equal(r.fields.approvalIds, null);
  assert.equal(r.fields.date, "2025-05-11");
});

const CAPS_LIST = `sertifikats
Sertifikāts apliecina, ka ārsts/-e
2025. gada 21. martā piedalījās seminārā un noklausījās lekcijas:
+ DIABĒTA TERAPIJA 2025-
KAS MAINĀS SGLT2 INHIBITORU JOMĀ?
DR. ANNA PARAUDZE
e MIEGA LOMA 2. TIPA CD ĀRSTĒŠANĀ
DR. ILZE PARAUGA
LĀB Sertifikācijas padome ar dokumentu Nr. TIP2025/1699 apliecina 2.0 TIP tālākizglītības
punktu, kas saskaņā ar MK noteikumiem
SALDUS
Paraugzeneca >`;

test("seminar with lectures in capitals: the first lecture is the title, in normal case, abbreviations kept", () => {
  const r = parseCertificateText(CAPS_LIST, profile, { ocr: true });
  assert.equal(r.fields.title, "Diabēta terapija 2025 - kas mainās SGLT2 inhibitoru jomā?");
  assert.deepEqual(names(r), ["Diabēta terapija 2025 - kas mainās SGLT2 inhibitoru jomā?", "Miega loma 2. tipa CD ārstēšanā"]);
  assert.equal(r.fields.points, 2);
});

const MEETING = `Piedalījās Latvijas Paraugu ārstu asociācijas sēdē
PROGRAMMA:
ĀDAS SLIMĪBAS: BIEŽAS, BET NEPAMANĪTAS.
Dr. Anna Paraudze,
miega speciāliste, Miega medicīnas centrs, Latvijas
Miega medicīnas biedrības valdes priekšsēdētāja
ULTRASKAŅAS LOMA MŪSDIENU MEDICĪNĀ.
NOSŪTĪJUMI RADIOLOĢIJĀ. = »
== Dr. Ilze Parauga, radiologs, Latvijas Radiologu Asociācijas prezidente
VMNVD AKTUALITĀTES.
Dr. Jānis Paraudzis, ģimenes ārsts, viceprezidents
Dr. Anna Paraudze
Latvijas Paraugu ārstu asociācijas prezidente
Rīgā, 2025. gada 22. marts.
Saskaņā ar MK noteikumiem Nr. 943 "Ārstniecības personu sertifikācijas kārtība" par dalību sēdē
tiek piešķirti 3 TIP tālākizglītības punktus`;

test("meeting: the body's meeting is the title, the programme its lectures, one lecture can have two lines; no number to look up", () => {
  const r = parseCertificateText(MEETING, profile, { ocr: true });
  assert.equal(r.fields.title, "Latvijas Paraugu ārstu asociācijas sēde");
  assert.equal(r.fields.points, 3);
  assert.equal(r.fields.approvalId, null);
  assert.deepEqual(r.numbers, []);
  assert.deepEqual(names(r), ["Ādas slimības: biežas, bet nepamanītas", "Ultraskaņas loma mūsdienu medicīnā. Nosūtījumi radioloģijā", "VMNVD aktualitātes"]);
});

const CONFERENCE = `SERTIFIKATS
izsniegts
Dr. J. Paraudzis, kurš
2025. gada 24. maijā piedalījās PARAUGU SLIMĪBU BIEDRĪBAS, LATVIJAS PARAUGU
ASOCIĀCIJAS un LATVIJAS ĀRSTU ASOCIĀCIJAS apvienotajā zinātniskajā
konferencē, atzīmējot Pasaules Veselības Dienu un noklausījās
sekojošas lekcijas:
Vitamīni mūsdienās: kas paliek.
Asoc. prof. Anna Paraudze
Vitamīni un neiroloģija.
Prof. Jānis Paraudzis
Zarnu veselība slimību kontekstā.
Dr. Ilze Parauga
LĀB Sertifikācijas padome ar dokumentu Nr. TIP2025/1705 apliecina 3.3 TIP tālākizglītības punktus`;

test("joint conference: one number, many lectures", () => {
  const r = parseCertificateText(CONFERENCE, profile, { ocr: true });
  assert.equal(r.fields.title, "Apvienotā zinātniskā konference, atzīmējot Pasaules Veselības Dienu");
  assert.equal(r.fields.lectures?.length, 3);
  assert.equal(r.fields.approvalId, "TIP2025/1705");
});

test("panel discussion: the name under the word for it, 'Lektori:' never", () => {
  const layer = "SERTIFIKATS\npiedalTjas\npane!diskusija\nIlgstosas sapes\nLektori:\nDr. Anna Paraudze, neirologs\nPamatojoties uz padomes lemumu, tiek\npies~irti 2,7 kreditpunkti(Nr.\nTIP2025/1884)\n2025. gada 24. maijs";
  assert.equal(parseCertificateText(layer, profile).fields.title, "Ilgstošas sāpes");
  const ocr = "piedalījās paneldiskusija\nLektori:\nDr. Anna Paraudze, neirologs\nPamatojoties uz padomes lēmumu\npiešķirti 2,7 kredītpunkti\n(Nr. TIP2025/1884)\n2025. gada 24. maijs";
  assert.doesNotMatch(parseCertificateText(ocr, profile, { ocr: true }).fields.title, /lektori/i);
});

test("a year inside a lecture's name does not end the list", () => {
  const text = "2025. gada 21. martā piedalījās seminārā un noklausījās lekcijas:\nKO VĒSTA 2024. GADA REKOMENDĀCIJAS?\nDR. ANNA PARAUDZE\nMIEGA TERAPIJA PRAKSĒ\nDR. ILZE PARAUGA\nRīgā, 2025. gada 21. martā";
  assert.deepEqual(names(parseCertificateText(text, profile, { ocr: true })), ["Ko vēsta 2024. gada rekomendācijas?", "Miega terapija praksē"]);
});

test("a programme page is no lecture list", () => {
  const text = `Piedalījās konferencē Paraugs\nPROGRAMMA:\n${Array.from({ length: 16 }, (_, i) => `Parauga lekcija numur ${i + 1}\nDr. Anna Paraudze`).join("\n")}`;
  assert.equal(parseCertificateText(text, profile, { ocr: true }).fields.lectures, null);
});

test("printed points read with OCR's semicolon", () => {
  assert.equal(findPoints(makeText("LĀB 2;6 TIP\nSertifikācijas padomes lēmumi:")).value, 2.6);
});

test("reads: the better read of the sentence wins when one lost words", () => {
  const layer = "piedalijas Paraugfarm organizetaja\nVESELIBAS AKADEMIJAS\nII cikla lekciju cikla\nMUGURAS SAPES\nun noklausijas lekcijas\nKa nesaslimt?\nDr. Anna Paraudze\n1,3 TIP 2025/1111";
  const ocr = "piedalījās Paraugfarm organizētajā\nII cikla lekciju ciklā\nMUGURAS SĀPES\nun noklausījās lekcijas\nKā nesaslimt?\nDr. Anna Paraudze\n1,3 TIP 2025/1111";
  assert.equal(parseLayerAndOcr(layer, ocr, profile).fields.title, "Veselības akadēmijas II cikla lekciju cikls: Muguras sāpes");
});

test("foreign certificate: no lectures, no LĀB number, title as before", () => {
  const r = parseCertificateText("CERTIFICATE OF ATTENDANCE\nThis is to certify that Jane Demo attended the course\nAdvanced Demo Knee Course\nReg. No. EU-2025-55\n10 May 2025\n8 CME credits", { specialty: "Ortopēds" });
  assert.equal(r.fields.title, "Advanced Demo Knee Course");
  assert.equal(r.fields.lectures, null);
  assert.deepEqual(r.numbers, []);
});
