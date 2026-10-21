import type { Locale } from "./i18n";
import type { CertificationKind, Profession } from "./types";

/**
 * Official specialty and method list used by the Latvian Medical Association (LĀB)
 * for TIP event audiences (filter_audience on the LĀB approved events list).
 * `code` is LĀB's own id. The profile stores the code plus the LV name, so course
 * and certificate matching keeps working on Latvian text.
 */
export interface Specialty {
  code: string;
  lv: string;
  en: string;
}

export const OTHER_SPECIALTY = "other";

export const SPECIALTIES: readonly Specialty[] = [
  { code: "1", lv: "Ajūrvēdas medicīnas metode", en: "Ayurvedic medicine (method)" },
  { code: "2", lv: "Akupunktūras ārsts", en: "Acupuncture" },
  { code: "3", lv: "Alergologs", en: "Allergology" },
  { code: "4", lv: "Algologs", en: "Pain medicine (algology)" },
  { code: "5", lv: "Alkohola, narkotisko un psihotropo vielu ietekmes pārbaudes metodes", en: "Alcohol, drug and psychotropic substance testing (method)" },
  { code: "6", lv: "Andrologs", en: "Andrology" },
  { code: "7", lv: "Anesteziologs, reanimatologs", en: "Anaesthesiology and intensive care" },
  { code: "8", lv: "Arodveselības un arodslimību ārsts", en: "Occupational medicine" },
  { code: "9", lv: "Ārstnieciskā perkutānā koronārā angioplastija (tai skaitā tentu implantācija)", en: "Percutaneous coronary angioplasty, incl. stent implantation (method)" },
  { code: "10", lv: "Ārstnieciskais Ci-Gun (Qi-Gong)", en: "Therapeutic Qigong (method)" },
  { code: "11", lv: "Asinsvadu ķirurgs", en: "Vascular surgery" },
  { code: "12", lv: "Asinsvadu patoloģijas ultrasonodoplerogrāfiskā diagnostika", en: "Vascular Doppler ultrasound diagnostics (method)" },
  { code: "13", lv: "Aurikuloakupunktūra", en: "Auricular acupuncture (method)" },
  { code: "14", lv: "Bērnu alergologs", en: "Paediatric allergology" },
  { code: "15", lv: "Bērnu audiologs", en: "Paediatric audiology" },
  { code: "16", lv: "Bērnu endokrinologs", en: "Paediatric endocrinology" },
  { code: "17", lv: "Bērnu gastroenterologs", en: "Paediatric gastroenterology" },
  { code: "18", lv: "Bērnu ginekologs", en: "Paediatric gynaecology" },
  { code: "19", lv: "Bērnu hematoonkologs", en: "Paediatric haematology and oncology" },
  { code: "20", lv: "Bērnu infektologs", en: "Paediatric infectious diseases" },
  { code: "21", lv: "Bērnu kardiologs", en: "Paediatric cardiology" },
  { code: "22", lv: "Bērnu ķirurgs", en: "Paediatric surgery" },
  { code: "23", lv: "Bērnu nefrologs", en: "Paediatric nephrology" },
  { code: "24", lv: "Bērnu neirologs", en: "Paediatric neurology" },
  { code: "25", lv: "Bērnu pneimonologs", en: "Paediatric pulmonology" },
  { code: "26", lv: "Bērnu psihiatrs", en: "Child and adolescent psychiatry" },
  { code: "27", lv: "Bērnu reimatologs", en: "Paediatric rheumatology" },
  { code: "28", lv: "Bērnu zobārsts", en: "Paediatric dentistry" },
  { code: "29", lv: "Biorezonanses terapija", en: "Bioresonance therapy (method)" },
  { code: "30", lv: "Bronhoskopija", en: "Bronchoscopy (method)" },
  { code: "31", lv: "Dermatologs, venerologs", en: "Dermatology and venereology" },
  { code: "32", lv: "Diagnostiskā sirds un lielo asinsvadu kateterizācija (tai skaitā koronārā angiogrāfija)", en: "Diagnostic cardiac catheterisation, incl. coronary angiography (method)" },
  { code: "33", lv: "Dietologs", en: "Dietetics" },
  { code: "34", lv: "Ehokardiogrāfija", en: "Echocardiography (method)" },
  { code: "35", lv: "Eksperts", en: "Expert" },
  { code: "36", lv: "Elektroencefalogrāfija", en: "Electroencephalography (method)" },
  { code: "37", lv: "Elektrofizioloģiskā diagnostika", en: "Electrophysiological diagnostics (method)" },
  { code: "38", lv: "Elektrokardiogrāfija", en: "Electrocardiography (method)" },
  { code: "39", lv: "Elektrokardiostimulācija un invazīvā ritma traucējumu korekcija", en: "Cardiac pacing and invasive arrhythmia treatment (method)" },
  { code: "40", lv: "Elektromiogrāfija", en: "Electromyography (method)" },
  { code: "41", lv: "Elektropunktūras diagnostika pēc Folla metodes", en: "Electroacupuncture diagnostics by Voll (method)" },
  { code: "42", lv: "Elektropunktūras un elektroakupunktūras terapija", en: "Electropuncture and electroacupuncture therapy (method)" },
  { code: "43", lv: "Endodontists", en: "Endodontics" },
  { code: "44", lv: "Endokrinologs", en: "Endocrinology" },
  { code: "45", lv: "Endoskopists (gastrointestinālā endoskopija)", en: "Endoscopy (gastrointestinal)" },
  { code: "46", lv: "Endovazālais ķirurgs", en: "Endovascular surgery" },
  { code: "48", lv: "Fizikālās un rehabilitācijas medicīnas ārsts", en: "Physical and rehabilitation medicine" },
  { code: "49", lv: "Fiziskās slodzes testi ar EKG", en: "Exercise stress testing with ECG (method)" },
  { code: "50", lv: "Flebologs", en: "Phlebology" },
  { code: "51", lv: "Foniatrs", en: "Phoniatrics" },
  { code: "52", lv: "Gastroenterologs", en: "Gastroenterology" },
  { code: "53", lv: "Gastrointestinālā endoskopija", en: "Gastrointestinal endoscopy (method)" },
  { code: "54", lv: "Geriatrs", en: "Geriatrics" },
  { code: "55", lv: "Ginekologs, dzemdību speciālists", en: "Obstetrics and gynaecology" },
  { code: "56", lv: "Ģenētiķis", en: "Medical genetics" },
  { code: "57", lv: "Ģimenes (vispārējās prakses) ārsts", en: "Family medicine (general practice)" },
  { code: "58", lv: "Hematologs", en: "Haematology" },
  { code: "59", lv: "Hepatologs", en: "Hepatology" },
  { code: "60", lv: "Hiperbārā oksigenācija", en: "Hyperbaric oxygen therapy (method)" },
  { code: "61", lv: "Hipnoterapeits", en: "Hypnotherapy" },
  { code: "62", lv: "Homeopāts", en: "Homeopathy" },
  { code: "63", lv: "Imunologs", en: "Immunology" },
  { code: "64", lv: "Internists", en: "Internal medicine" },
  { code: "65", lv: "Infektologs", en: "Infectious diseases" },
  { code: "66", lv: "Kardiologs", en: "Cardiology" },
  { code: "67", lv: "Klīniskais farmakologs", en: "Clinical pharmacology" },
  { code: "68", lv: "Klīniskais fiziologs", en: "Clinical physiology" },
  { code: "69", lv: "Klīniskais mikrobiologs", en: "Clinical microbiology" },
  { code: "70", lv: "Kosmetologs", en: "Cosmetology" },
  { code: "71", lv: "Ķirurgs", en: "General surgery" },
  { code: "72", lv: "Laboratorijas ārsts", en: "Laboratory medicine" },
  { code: "73", lv: "Lāzerakupunktūra", en: "Laser acupuncture (method)" },
  { code: "74", lv: "Lāzerterapija", en: "Laser therapy (method)" },
  { code: "75", lv: "Manuālais terapeits", en: "Manual therapy" },
  { code: "76", lv: "Medicīnas bioestēzija", en: "Medical bioaesthetics" },
  { code: "77", lv: "Mutes, sejas un žokļu ķirurgs", en: "Oral and maxillofacial surgery" },
  { code: "78", lv: "Narkologs", en: "Addiction medicine" },
  { code: "79", lv: "Neatliekamās medicīnas ārsts", en: "Emergency medicine" },
  { code: "80", lv: "Nefrologs", en: "Nephrology" },
  { code: "81", lv: "Neirokinezioloģiskā diagnostika pēc Vojta metodes", en: "Vojta neurokinesiological diagnostics (method)" },
  { code: "82", lv: "Neiroķirurgs", en: "Neurosurgery" },
  { code: "83", lv: "Neirologs", en: "Neurology" },
  { code: "84", lv: "Neirosonogrāfija jaundzimušajiem un zīdaiņa vecuma bērniem", en: "Neurosonography in newborns and infants (method)" },
  { code: "85", lv: "Neirosonoloģiskā izmeklēšana", en: "Neurosonology (method)" },
  { code: "86", lv: "Neonatologs", en: "Neonatology" },
  { code: "87", lv: "Oftalmologs", en: "Ophthalmology" },
  { code: "88", lv: "Onkologs ķīmijterapeits", en: "Medical oncology (chemotherapy)" },
  { code: "89", lv: "Onkoloģijas ginekologs", en: "Gynaecological oncology" },
  { code: "90", lv: "Ortodonts", en: "Orthodontics" },
  { code: "91", lv: "Osteopātijas metode", en: "Osteopathy (method)" },
  { code: "92", lv: "Osteopāts", en: "Osteopathy" },
  { code: "93", lv: "Osteorefleksoterapeits", en: "Osteoreflexotherapy" },
  { code: "94", lv: "Osteorefleksoterapija", en: "Osteoreflexotherapy (method)" },
  { code: "95", lv: "Otolaringologs", en: "Otorhinolaryngology (ENT)" },
  { code: "96", lv: "Paliatīvās aprūpes speciālists", en: "Palliative care" },
  { code: "97", lv: "Paradontologs", en: "Periodontology" },
  { code: "98", lv: "Patologs", en: "Pathology" },
  { code: "99", lv: "Pediatrs", en: "Paediatrics" },
  { code: "100", lv: "Perifēro asinsvadu angioplastija", en: "Peripheral vascular angioplasty (method)" },
  { code: "102", lv: "Plastiskais ķirurgs", en: "Plastic surgery" },
  { code: "103", lv: "Pneimonologs", en: "Pulmonology" },
  { code: "104", lv: "Psihiatrs", en: "Psychiatry" },
  { code: "105", lv: "Psihoterapeits", en: "Psychotherapy" },
  { code: "106", lv: "Radiologs diagnosts", en: "Diagnostic radiology" },
  { code: "107", lv: "Radiologs terapeits", en: "Radiation oncology" },
  { code: "108", lv: "Reimatologs", en: "Rheumatology" },
  { code: "109", lv: "Rokas ķirurgs", en: "Hand surgery" },
  { code: "110", lv: "Sabiedrības veselības ārsts", en: "Public health medicine" },
  { code: "111", lv: "Seksologs, seksopatologs", en: "Sexology" },
  { code: "112", lv: "Selektīvā fototermolīze un ablatīvā lāzerķirurģija", en: "Selective photothermolysis and ablative laser surgery (method)" },
  { code: "113", lv: "Sirds ķirurgs", en: "Cardiac surgery" },
  { code: "114", lv: "Sociālās apdrošināšanas ārsts", en: "Social insurance medicine" },
  { code: "115", lv: "Sporta ārsts", en: "Sports medicine" },
  { code: "116", lv: "Su-Jok", en: "Su-Jok therapy (method)" },
  { code: "117", lv: "Tiesu medicīnas eksperts", en: "Forensic medicine" },
  { code: "118", lv: "Tiesu psihiatrijas eksperts", en: "Forensic psychiatry" },
  { code: "119", lv: "Torakālais ķirurgs", en: "Thoracic surgery" },
  { code: "120", lv: "Transfuziologs", en: "Transfusion medicine" },
  { code: "121", lv: "Transplantologs", en: "Transplant medicine" },
  { code: "122", lv: "Traumatologs, ortopēds", en: "Traumatology and orthopaedics" },
  { code: "123", lv: "Trihologs", en: "Trichology" },
  { code: "124", lv: "Ultrasonogrāfija dzemdniecībā un ginekoloģijā", en: "Ultrasound in obstetrics and gynaecology (method)" },
  { code: "125", lv: "Urologs", en: "Urology" },
  { code: "126", lv: "Veselības aprūpes vadības ārsts", en: "Healthcare management" },
  { code: "127", lv: "Virspusēji novietoto vēdera dobuma orgānu un asinsvadu ultrasonogrāfija", en: "Ultrasound of superficial and abdominal organs and vessels (method)" },
  { code: "128", lv: "Zobārsts", en: "Dentistry" },
  { code: "129", lv: "Zobu protēzists", en: "Prosthodontics" },
  { code: "131", lv: "Antroposofā medicīna", en: "Anthroposophic medicine" },
];

/**
 * Specialties of the other certified professions, from Cabinet Regulation No. 460 Annex 1
 * (as worded by Reg. No. 269, 06 May 2025, likumi.lv/ta/id/137108). These are not on the LĀB list.
 * Functional specialists: one specialty per profession, Medical Treatment Law Section 45.1(1).
 * Nurses are not certified (Medical Treatment Law Section 26(2)); their specializations come from education.
 */
export const OTHER_PROFESSION_SPECIALTIES: readonly Specialty[] = [
  { code: "pa-ems", lv: "Neatliekamās medicīnas ārsta palīgs (feldšeris)", en: "Emergency medicine physician assistant (paramedic)" },
  { code: "pa-amb", lv: "Ambulatorā dienesta ārsta palīgs", en: "Outpatient physician assistant" },
  { code: "midwife", lv: "Vecmāte", en: "Midwife" },
  { code: "fs-physio", lv: "Fizioterapeits", en: "Physiotherapist" },
  { code: "fs-ot", lv: "Ergoterapeits", en: "Occupational therapist" },
  { code: "fs-ortho", lv: "Tehniskais ortopēds", en: "Orthotist and prosthetist" },
  { code: "fs-slt", lv: "Audiologopēds (klīniskais logopēds)", en: "Speech and language therapist" },
  { code: "fs-diet", lv: "Uztura speciālists", en: "Dietitian" },
  { code: "fs-art", lv: "Mākslas terapeits", en: "Art therapist" },
  { code: "fs-optom", lv: "Optometrists", en: "Optometrist" },
  { code: "nu-gen", lv: "Māsa (vispārējās aprūpes māsa)", en: "General care nurse" },
  { code: "nu-icu", lv: "Māsas specializācija anestēzijā un intensīvajā aprūpē", en: "Nurse, anaesthesia and intensive care" },
  { code: "nu-child", lv: "Māsas specializācija bērnu aprūpē", en: "Nurse, child care" },
  { code: "nu-psych", lv: "Māsas specializācija psihiatrijā un narkoloģijā", en: "Nurse, psychiatry and addiction" },
  { code: "nu-periop", lv: "Māsas specializācija perioperatīvajā aprūpē", en: "Nurse, perioperative care" },
];

/** Reg. 460 Annex 1 row 20, matched to LĀB codes: Zobārsts, Bērnu zobārsts, Endodontists, Ortodonts, Paradontologs, Zobu protēzists */
const DENTIST_CODES = ["128", "28", "43", "90", "97", "129"];

const ALL = [...SPECIALTIES, ...OTHER_PROFESSION_SPECIALTIES];
const BY_CODE = new Map(ALL.map((s) => [s.code, s]));
const pick = (prefix: string) => OTHER_PROFESSION_SPECIALTIES.filter((s) => s.code.startsWith(prefix));

/**
 * Specialties a profession can be certified in. Empty list: no fixed list, the user types it.
 * Method certificates use the LĀB list, which holds the methods.
 */
export function specialtiesFor(profession: Profession, kind: CertificationKind): readonly Specialty[] {
  if (profession === "doctor" || (kind === "method" && profession === "dentist")) return SPECIALTIES;
  if (kind === "method") return [];
  switch (profession) {
    case "dentist":
      return DENTIST_CODES.map((c) => BY_CODE.get(c)!);
    case "physician_assistant":
      return pick("pa-");
    case "midwife":
      return pick("midwife");
    case "functional_specialist":
      return pick("fs-");
    case "nurse":
      return pick("nu-");
    default:
      return [];
  }
}

const norm = (v: string) => v.toLocaleLowerCase("lv").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Common free-text values typed before the list existed, normalised -> LĀB code */
const ALIASES: Record<string, string> = {
  "family medicine": "57", "family doctor": "57", "general practice": "57", "general practitioner": "57", gp: "57",
  "ģimenes medicīna": "57", "ģimenes ārsts": "57", "ģimenes ārste": "57",
  cardiology: "66", cardiologist: "66", kardioloģija: "66",
  paediatrics: "99", pediatrics: "99", pediatrician: "99", paediatrician: "99", pediatrija: "99",
  surgery: "71", surgeon: "71", ķirurģija: "71",
  neurology: "83", neurologist: "83", neiroloģija: "83",
  psychiatry: "104", psychiatrist: "104", psihiatrija: "104",
  dermatology: "31", dermatologist: "31", dermatoloģija: "31",
  ophthalmology: "87", ophthalmologist: "87", oftalmoloģija: "87",
  orthopaedics: "122", orthopedics: "122", traumatology: "122", "orthopaedic surgery": "122", ortopēdija: "122", traumatoloģija: "122",
  anaesthesiology: "7", anesthesiology: "7", anaesthesia: "7", anestezioloģija: "7",
  "internal medicine": "64", internist: "64", "iekšķīgās slimības": "64",
  "emergency medicine": "79", "neatliekamā medicīna": "79",
  dentistry: "128", dentist: "128", zobārstniecība: "128",
  gynaecology: "55", gynecology: "55", obstetrics: "55", "obstetrics and gynaecology": "55", "obstetrics and gynecology": "55", ginekoloģija: "55",
  radiology: "106", radiologist: "106", radioloģija: "106",
  urology: "125", uroloģija: "125",
  endocrinology: "44", endokrinoloģija: "44",
  gastroenterology: "52", gastroenteroloģija: "52",
  pulmonology: "103", pneimonoloģija: "103",
  rheumatology: "108", reimatoloģija: "108",
  oncology: "88", onkoloģija: "88",
  otolaryngology: "95", otorhinolaryngology: "95", ent: "95", otolaringoloģija: "95",
  "rehabilitation": "48", "physical medicine": "48", rehabilitoloģija: "48",
  "occupational medicine": "8",
  pathology: "98", patoloģija: "98",
  "laboratory medicine": "72",
  "infectious diseases": "65", infektoloģija: "65",
  neurosurgery: "82", nephrology: "80", haematology: "58", hematology: "58", geriatrics: "54", neonatology: "86",
};

const BY_NAME = new Map<string, string>();
for (const s of ALL) {
  BY_NAME.set(norm(s.lv), s.code);
  BY_NAME.set(norm(s.en), s.code);
}
for (const [k, code] of Object.entries(ALIASES)) BY_NAME.set(norm(k), code);

export const specialtyByCode = (code: string | null | undefined): Specialty | null => (code ? BY_CODE.get(code) ?? null : null);

/** Map any stored value (LV name, EN name, code or old free text) to a listed specialty, or null */
export function findSpecialty(value: string | null | undefined): Specialty | null {
  if (!value) return null;
  const v = value.trim();
  return BY_CODE.get(v) ?? BY_CODE.get(BY_NAME.get(norm(v)) ?? "") ?? null;
}

/**
 * The profile's specialty as { code, text } for the form: a listed code, or "other" with the free text.
 * Empty profile -> code null.
 */
export function resolveSpecialty(p: { specialty: string; specialtyCode?: string | null }): { code: string | null; text: string } {
  const listed = specialtyByCode(p.specialtyCode) ?? findSpecialty(p.specialty);
  if (listed) return { code: listed.code, text: "" };
  if (p.specialtyCode === OTHER_SPECIALTY || p.specialty.trim()) return { code: OTHER_SPECIALTY, text: p.specialty.trim() };
  return { code: null, text: "" };
}

/** Display name of a stored specialty in the UI language; unlisted free text is shown as typed */
export function specialtyLabel(value: string | null | undefined, locale: Locale): string {
  if (!value) return "";
  const s = findSpecialty(value);
  return s ? s[locale] : value.trim();
}
