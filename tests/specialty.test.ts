// Specialty matcher (lib/parse/specialty.ts). Run: npx tsx --test tests/specialty.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { matchesSpecialty } from "../lib/parse/specialty";

const yes = (specialty: string, ...texts: string[]) => {
  for (const t of texts) assert.equal(matchesSpecialty(t, specialty), true, `${specialty} should match: ${t}`);
};
const no = (specialty: string, ...texts: string[]) => {
  for (const t of texts) assert.equal(matchesSpecialty(t, specialty), false, `${specialty} should not match: ${t}`);
};

test("false positives from the 5-letter stems (code review L1)", () => {
  no("Internists", "International conference on wound healing", "Interaktīvs seminārs", "Rezultātu interpretācija");
  no("Radiologs diagnosts", "Radiofrekvences ablācija");
  no("Radiologs terapeits", "Radiofrekvences ablācija");
  no("Neirologs", "Neiroķirurģijas aktualitātes");
  no("Kardiologs", "Kardiopulmonālā reanimācija pieaugušajiem", "Kardiotokogrāfija dzemdībās");
  no("Patologs", "Sirds patoloģija ģimenes ārsta praksē");
  no("Radiologs diagnosts", "Infekciju profilakse, diagnostika un pārvaldība");
});

test("a narrower listed specialty does not count as the broader one", () => {
  no("Kardiologs", "Bērnu kardiologs");
  no("Ķirurgs", "Sirds ķirurgs", "Plastiskais ķirurgs; Rokas ķirurgs");
  no("Radiologs diagnosts", "Radiologs terapeits");
  no("Psihiatrs", "Bērnu psihiatrs");
  // the broader name next to it still counts
  yes("Kardiologs", "Bērnu kardiologs; Kardiologs");
});

test("a lecturer's credit is not the event's field", () => {
  no("Kardiologs", "Diabēts primārajā aprūpē. Dr. Anna Bērziņa, kardiologs, PSKUS");
  no("Neirologs", "Izdegšanas sindroms\nDr. Anna Bērziņa\nneirologs\nRīga");
});

test("top 10 specialties: Latvian declensions", () => {
  yes("Ģimenes (vispārējās prakses) ārsts", "Hipertensija ģimenes ārsta praksē", "Ģimenes ārstiem", "Ģimenes (vispārējās prakses) ārsts", "Diabēts primārajā aprūpē");
  yes("Internists", "Aktualitātes iekšķīgo slimību jomā", "Internā medicīna 2026", "Internists");
  yes("Pediatrs", "Klīniskās situācijas pediatrijā", "Pediatriem", "Bērnu slimību aktualitātes");
  yes("Anesteziologs, reanimatologs", "Anestezioloģijas un reanimatoloģijas kongress", "Skrīnings anesteziologiem", "Intensīvā terapija");
  yes("Ķirurgs", "Kolorektālā ķirurģija", "Ķirurgiem par trūcēm", "Ķirurgs");
  yes("Ginekologs, dzemdību speciālists", "Dzemdniecības aktualitātes", "Ginekoloģijā", "Dzemdību vadīšana");
  yes("Psihiatrs", "Psihiatrijas aktualitātes", "Psihiatriem");
  yes("Kardiologs", "Kardioloģija", "Jaunumi kardioloģijā", "Seminārs kardiologiem", "Sirds mazspējas terapija", "Elektrokardiogrāfija");
  yes("Radiologs diagnosts", "Neatliekamās situācijas radioloģijā", "Seminārs radiologiem", "Datortomogrāfija");
  yes("Neirologs", "Neiroloģijā", "Neirologiem", "Neatliekamie stāvokļi neiroloģijā");
});

test("English and Russian titles", () => {
  yes("Ģimenes (vispārējās prakses) ārsts", "Chronic disease management in primary care", "Family medicine update", "Конференция семейных врачей");
  yes("Internists", "Internal medicine update 2026", "Внутренние болезни: обзор");
  yes("Pediatrs", "Paediatric emergencies", "Pediatrics today", "Педиатрия сегодня");
  yes("Anesteziologs, reanimatologs", "Anaesthesiology congress", "Intensive care update", "Анестезиология и реаниматология");
  yes("Ķirurgs", "Advances in surgery", "Хирургия грыж");
  yes("Ginekologs, dzemdību speciālists", "Obstetrics and gynaecology", "Акушерство и гинекология");
  yes("Psihiatrs", "Psychiatry in practice", "Психиатрия");
  yes("Kardiologs", "European Society of Cardiology", "Кардиология", "Arrhythmia management");
  yes("Radiologs diagnosts", "Chest CT for radiologists", "Рентгенология");
  yes("Neirologs", "Neurology", "Неврология");
  no("Kardiologs", "International conference on wound healing");
});

test("OCR text without diacritics", () => {
  yes("Kardiologs", "SEMINARS KARDIOLOGIJAS AKTUALITATES");
  yes("Traumatologs, ortopēds", "Atzinibas raksts traumatologam-ortopedam", "Shoulder and knee arthroscopy");
});

test("profiles typed as free text before the list existed", () => {
  yes("Kardioloģija", "Jaunumi kardioloģijā");
  yes("Cardiology", "Jaunumi kardioloģijā");
  yes("Traumatoloģija un ortopēdija", "Shoulder arthroscopy");
  no("Kardioloģija", "Interaktīvs seminārs");
});

test("no specialty, no match", () => {
  no("", "Kardioloģija");
  no("   ", "Kardioloģija");
  no("Eksperts", "Eksperts");
});
