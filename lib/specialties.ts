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
  ru: string;
}

export const OTHER_SPECIALTY = "other";

export const SPECIALTIES: readonly Specialty[] = [
  { code: "1", lv: "Ajūrvēdas medicīnas metode", en: "Ayurvedic medicine (method)", ru: "Аюрведическая медицина (метод)" },
  { code: "2", lv: "Akupunktūras ārsts", en: "Acupuncture", ru: "Врач-акупунктурист" },
  { code: "3", lv: "Alergologs", en: "Allergology", ru: "Аллерголог" },
  { code: "4", lv: "Algologs", en: "Pain medicine (algology)", ru: "Альголог (лечение боли)" },
  { code: "5", lv: "Alkohola, narkotisko un psihotropo vielu ietekmes pārbaudes metodes", en: "Alcohol, drug and psychotropic substance testing (method)", ru: "Методы проверки на алкоголь, наркотические и психотропные вещества (метод)" },
  { code: "6", lv: "Andrologs", en: "Andrology", ru: "Андролог" },
  { code: "7", lv: "Anesteziologs, reanimatologs", en: "Anaesthesiology and intensive care", ru: "Анестезиолог-реаниматолог" },
  { code: "8", lv: "Arodveselības un arodslimību ārsts", en: "Occupational medicine", ru: "Врач гигиены труда и профзаболеваний" },
  { code: "9", lv: "Ārstnieciskā perkutānā koronārā angioplastija (tai skaitā tentu implantācija)", en: "Percutaneous coronary angioplasty, incl. stent implantation (method)", ru: "Чрескожная коронарная ангиопластика, в т. ч. имплантация стентов (метод)" },
  { code: "10", lv: "Ārstnieciskais Ci-Gun (Qi-Gong)", en: "Therapeutic Qigong (method)", ru: "Лечебный цигун (метод)" },
  { code: "11", lv: "Asinsvadu ķirurgs", en: "Vascular surgery", ru: "Сосудистый хирург" },
  { code: "12", lv: "Asinsvadu patoloģijas ultrasonodoplerogrāfiskā diagnostika", en: "Vascular Doppler ultrasound diagnostics (method)", ru: "Ультразвуковая допплерография сосудов (метод)" },
  { code: "13", lv: "Aurikuloakupunktūra", en: "Auricular acupuncture (method)", ru: "Аурикулоакупунктура (метод)" },
  { code: "14", lv: "Bērnu alergologs", en: "Paediatric allergology", ru: "Детский аллерголог" },
  { code: "15", lv: "Bērnu audiologs", en: "Paediatric audiology", ru: "Детский аудиолог" },
  { code: "16", lv: "Bērnu endokrinologs", en: "Paediatric endocrinology", ru: "Детский эндокринолог" },
  { code: "17", lv: "Bērnu gastroenterologs", en: "Paediatric gastroenterology", ru: "Детский гастроэнтеролог" },
  { code: "18", lv: "Bērnu ginekologs", en: "Paediatric gynaecology", ru: "Детский гинеколог" },
  { code: "19", lv: "Bērnu hematoonkologs", en: "Paediatric haematology and oncology", ru: "Детский гематоонколог" },
  { code: "20", lv: "Bērnu infektologs", en: "Paediatric infectious diseases", ru: "Детский инфекционист" },
  { code: "21", lv: "Bērnu kardiologs", en: "Paediatric cardiology", ru: "Детский кардиолог" },
  { code: "22", lv: "Bērnu ķirurgs", en: "Paediatric surgery", ru: "Детский хирург" },
  { code: "23", lv: "Bērnu nefrologs", en: "Paediatric nephrology", ru: "Детский нефролог" },
  { code: "24", lv: "Bērnu neirologs", en: "Paediatric neurology", ru: "Детский невролог" },
  { code: "25", lv: "Bērnu pneimonologs", en: "Paediatric pulmonology", ru: "Детский пульмонолог" },
  { code: "26", lv: "Bērnu psihiatrs", en: "Child and adolescent psychiatry", ru: "Детский психиатр" },
  { code: "27", lv: "Bērnu reimatologs", en: "Paediatric rheumatology", ru: "Детский ревматолог" },
  { code: "28", lv: "Bērnu zobārsts", en: "Paediatric dentistry", ru: "Детский стоматолог" },
  { code: "29", lv: "Biorezonanses terapija", en: "Bioresonance therapy (method)", ru: "Биорезонансная терапия (метод)" },
  { code: "30", lv: "Bronhoskopija", en: "Bronchoscopy (method)", ru: "Бронхоскопия (метод)" },
  { code: "31", lv: "Dermatologs, venerologs", en: "Dermatology and venereology", ru: "Дерматовенеролог" },
  { code: "32", lv: "Diagnostiskā sirds un lielo asinsvadu kateterizācija (tai skaitā koronārā angiogrāfija)", en: "Diagnostic cardiac catheterisation, incl. coronary angiography (method)", ru: "Диагностическая катетеризация сердца и крупных сосудов, в т. ч. коронарография (метод)" },
  { code: "33", lv: "Dietologs", en: "Dietetics", ru: "Диетолог" },
  { code: "34", lv: "Ehokardiogrāfija", en: "Echocardiography (method)", ru: "Эхокардиография (метод)" },
  { code: "35", lv: "Eksperts", en: "Expert", ru: "Эксперт" },
  { code: "36", lv: "Elektroencefalogrāfija", en: "Electroencephalography (method)", ru: "Электроэнцефалография (метод)" },
  { code: "37", lv: "Elektrofizioloģiskā diagnostika", en: "Electrophysiological diagnostics (method)", ru: "Электрофизиологическая диагностика (метод)" },
  { code: "38", lv: "Elektrokardiogrāfija", en: "Electrocardiography (method)", ru: "Электрокардиография (метод)" },
  { code: "39", lv: "Elektrokardiostimulācija un invazīvā ritma traucējumu korekcija", en: "Cardiac pacing and invasive arrhythmia treatment (method)", ru: "Кардиостимуляция и инвазивное лечение аритмий (метод)" },
  { code: "40", lv: "Elektromiogrāfija", en: "Electromyography (method)", ru: "Электромиография (метод)" },
  { code: "41", lv: "Elektropunktūras diagnostika pēc Folla metodes", en: "Electroacupuncture diagnostics by Voll (method)", ru: "Электроакупунктурная диагностика по Фоллю (метод)" },
  { code: "42", lv: "Elektropunktūras un elektroakupunktūras terapija", en: "Electropuncture and electroacupuncture therapy (method)", ru: "Электропунктура и электроакупунктурная терапия (метод)" },
  { code: "43", lv: "Endodontists", en: "Endodontics", ru: "Эндодонтист" },
  { code: "44", lv: "Endokrinologs", en: "Endocrinology", ru: "Эндокринолог" },
  { code: "45", lv: "Endoskopists (gastrointestinālā endoskopija)", en: "Endoscopy (gastrointestinal)", ru: "Эндоскопист" },
  { code: "46", lv: "Endovazālais ķirurgs", en: "Endovascular surgery", ru: "Эндоваскулярный хирург" },
  { code: "48", lv: "Fizikālās un rehabilitācijas medicīnas ārsts", en: "Physical and rehabilitation medicine", ru: "Врач физической и реабилитационной медицины" },
  { code: "49", lv: "Fiziskās slodzes testi ar EKG", en: "Exercise stress testing with ECG (method)", ru: "Нагрузочная проба с ЭКГ (метод)" },
  { code: "50", lv: "Flebologs", en: "Phlebology", ru: "Флеболог" },
  { code: "51", lv: "Foniatrs", en: "Phoniatrics", ru: "Фониатр" },
  { code: "52", lv: "Gastroenterologs", en: "Gastroenterology", ru: "Гастроэнтеролог" },
  { code: "53", lv: "Gastrointestinālā endoskopija", en: "Gastrointestinal endoscopy (method)", ru: "Эндоскопия желудочно-кишечного тракта (метод)" },
  { code: "54", lv: "Geriatrs", en: "Geriatrics", ru: "Гериатр" },
  { code: "55", lv: "Ginekologs, dzemdību speciālists", en: "Obstetrics and gynaecology", ru: "Акушер-гинеколог" },
  { code: "56", lv: "Ģenētiķis", en: "Medical genetics", ru: "Медицинский генетик" },
  { code: "57", lv: "Ģimenes (vispārējās prakses) ārsts", en: "Family medicine (general practice)", ru: "Семейный врач (врач общей практики)" },
  { code: "58", lv: "Hematologs", en: "Haematology", ru: "Гематолог" },
  { code: "59", lv: "Hepatologs", en: "Hepatology", ru: "Гепатолог" },
  { code: "60", lv: "Hiperbārā oksigenācija", en: "Hyperbaric oxygen therapy (method)", ru: "Гипербарическая оксигенация (метод)" },
  { code: "61", lv: "Hipnoterapeits", en: "Hypnotherapy", ru: "Гипнотерапевт" },
  { code: "62", lv: "Homeopāts", en: "Homeopathy", ru: "Гомеопат" },
  { code: "63", lv: "Imunologs", en: "Immunology", ru: "Иммунолог" },
  { code: "64", lv: "Internists", en: "Internal medicine", ru: "Терапевт (внутренние болезни)" },
  { code: "65", lv: "Infektologs", en: "Infectious diseases", ru: "Инфекционист" },
  { code: "66", lv: "Kardiologs", en: "Cardiology", ru: "Кардиолог" },
  { code: "67", lv: "Klīniskais farmakologs", en: "Clinical pharmacology", ru: "Клинический фармаколог" },
  { code: "68", lv: "Klīniskais fiziologs", en: "Clinical physiology", ru: "Клинический физиолог" },
  { code: "69", lv: "Klīniskais mikrobiologs", en: "Clinical microbiology", ru: "Клинический микробиолог" },
  { code: "70", lv: "Kosmetologs", en: "Cosmetology", ru: "Косметолог" },
  { code: "71", lv: "Ķirurgs", en: "General surgery", ru: "Хирург" },
  { code: "72", lv: "Laboratorijas ārsts", en: "Laboratory medicine", ru: "Врач лабораторной медицины" },
  { code: "73", lv: "Lāzerakupunktūra", en: "Laser acupuncture (method)", ru: "Лазерная акупунктура (метод)" },
  { code: "74", lv: "Lāzerterapija", en: "Laser therapy (method)", ru: "Лазерная терапия (метод)" },
  { code: "75", lv: "Manuālais terapeits", en: "Manual therapy", ru: "Мануальный терапевт" },
  { code: "76", lv: "Medicīnas bioestēzija", en: "Medical bioaesthetics", ru: "Медицинская биоэстетика" },
  { code: "77", lv: "Mutes, sejas un žokļu ķirurgs", en: "Oral and maxillofacial surgery", ru: "Челюстно-лицевой хирург" },
  { code: "78", lv: "Narkologs", en: "Addiction medicine", ru: "Нарколог" },
  { code: "79", lv: "Neatliekamās medicīnas ārsts", en: "Emergency medicine", ru: "Врач неотложной медицины" },
  { code: "80", lv: "Nefrologs", en: "Nephrology", ru: "Нефролог" },
  { code: "81", lv: "Neirokinezioloģiskā diagnostika pēc Vojta metodes", en: "Vojta neurokinesiological diagnostics (method)", ru: "Нейрокинезиологическая диагностика по Войте (метод)" },
  { code: "82", lv: "Neiroķirurgs", en: "Neurosurgery", ru: "Нейрохирург" },
  { code: "83", lv: "Neirologs", en: "Neurology", ru: "Невролог" },
  { code: "84", lv: "Neirosonogrāfija jaundzimušajiem un zīdaiņa vecuma bērniem", en: "Neurosonography in newborns and infants (method)", ru: "Нейросонография новорождённых и младенцев (метод)" },
  { code: "85", lv: "Neirosonoloģiskā izmeklēšana", en: "Neurosonology (method)", ru: "Нейросонология (метод)" },
  { code: "86", lv: "Neonatologs", en: "Neonatology", ru: "Неонатолог" },
  { code: "87", lv: "Oftalmologs", en: "Ophthalmology", ru: "Офтальмолог" },
  { code: "88", lv: "Onkologs ķīmijterapeits", en: "Medical oncology (chemotherapy)", ru: "Онколог-химиотерапевт" },
  { code: "89", lv: "Onkoloģijas ginekologs", en: "Gynaecological oncology", ru: "Онкогинеколог" },
  { code: "90", lv: "Ortodonts", en: "Orthodontics", ru: "Ортодонт" },
  { code: "91", lv: "Osteopātijas metode", en: "Osteopathy (method)", ru: "Остеопатия (метод)" },
  { code: "92", lv: "Osteopāts", en: "Osteopathy", ru: "Остеопат" },
  { code: "93", lv: "Osteorefleksoterapeits", en: "Osteoreflexotherapy", ru: "Остеорефлексотерапевт" },
  { code: "94", lv: "Osteorefleksoterapija", en: "Osteoreflexotherapy (method)", ru: "Остеорефлексотерапия (метод)" },
  { code: "95", lv: "Otolaringologs", en: "Otorhinolaryngology (ENT)", ru: "Оториноларинголог (ЛОР)" },
  { code: "96", lv: "Paliatīvās aprūpes speciālists", en: "Palliative care", ru: "Врач паллиативной помощи" },
  { code: "97", lv: "Paradontologs", en: "Periodontology", ru: "Пародонтолог" },
  { code: "98", lv: "Patologs", en: "Pathology", ru: "Патолог" },
  { code: "99", lv: "Pediatrs", en: "Paediatrics", ru: "Педиатр" },
  { code: "100", lv: "Perifēro asinsvadu angioplastija", en: "Peripheral vascular angioplasty (method)", ru: "Ангиопластика периферических сосудов (метод)" },
  { code: "102", lv: "Plastiskais ķirurgs", en: "Plastic surgery", ru: "Пластический хирург" },
  { code: "103", lv: "Pneimonologs", en: "Pulmonology", ru: "Пульмонолог" },
  { code: "104", lv: "Psihiatrs", en: "Psychiatry", ru: "Психиатр" },
  { code: "105", lv: "Psihoterapeits", en: "Psychotherapy", ru: "Психотерапевт" },
  { code: "106", lv: "Radiologs diagnosts", en: "Diagnostic radiology", ru: "Радиолог-диагност" },
  { code: "107", lv: "Radiologs terapeits", en: "Radiation oncology", ru: "Радиолог-онколог (лучевая терапия)" },
  { code: "108", lv: "Reimatologs", en: "Rheumatology", ru: "Ревматолог" },
  { code: "109", lv: "Rokas ķirurgs", en: "Hand surgery", ru: "Хирург кисти" },
  { code: "110", lv: "Sabiedrības veselības ārsts", en: "Public health medicine", ru: "Врач общественного здравоохранения" },
  { code: "111", lv: "Seksologs, seksopatologs", en: "Sexology", ru: "Сексолог" },
  { code: "112", lv: "Selektīvā fototermolīze un ablatīvā lāzerķirurģija", en: "Selective photothermolysis and ablative laser surgery (method)", ru: "Селективный фототермолиз и абляционная лазерная хирургия (метод)" },
  { code: "113", lv: "Sirds ķirurgs", en: "Cardiac surgery", ru: "Кардиохирург" },
  { code: "114", lv: "Sociālās apdrošināšanas ārsts", en: "Social insurance medicine", ru: "Врач социального страхования" },
  { code: "115", lv: "Sporta ārsts", en: "Sports medicine", ru: "Спортивный врач" },
  { code: "116", lv: "Su-Jok", en: "Su-Jok therapy (method)", ru: "Су-джок терапия (метод)" },
  { code: "117", lv: "Tiesu medicīnas eksperts", en: "Forensic medicine", ru: "Судебно-медицинский эксперт" },
  { code: "118", lv: "Tiesu psihiatrijas eksperts", en: "Forensic psychiatry", ru: "Судебный психиатр" },
  { code: "119", lv: "Torakālais ķirurgs", en: "Thoracic surgery", ru: "Торакальный хирург" },
  { code: "120", lv: "Transfuziologs", en: "Transfusion medicine", ru: "Трансфузиолог" },
  { code: "121", lv: "Transplantologs", en: "Transplant medicine", ru: "Трансплантолог" },
  { code: "122", lv: "Traumatologs, ortopēds", en: "Traumatology and orthopaedics", ru: "Травматолог-ортопед" },
  { code: "123", lv: "Trihologs", en: "Trichology", ru: "Трихолог" },
  { code: "124", lv: "Ultrasonogrāfija dzemdniecībā un ginekoloģijā", en: "Ultrasound in obstetrics and gynaecology (method)", ru: "УЗИ в акушерстве и гинекологии (метод)" },
  { code: "125", lv: "Urologs", en: "Urology", ru: "Уролог" },
  { code: "126", lv: "Veselības aprūpes vadības ārsts", en: "Healthcare management", ru: "Организатор здравоохранения" },
  { code: "127", lv: "Virspusēji novietoto vēdera dobuma orgānu un asinsvadu ultrasonogrāfija", en: "Ultrasound of superficial and abdominal organs and vessels (method)", ru: "УЗИ поверхностных и брюшных органов и сосудов (метод)" },
  { code: "128", lv: "Zobārsts", en: "Dentistry", ru: "Стоматолог" },
  { code: "129", lv: "Zobu protēzists", en: "Prosthodontics", ru: "Стоматолог-ортопед (протезист)" },
  { code: "131", lv: "Antroposofā medicīna", en: "Anthroposophic medicine", ru: "Антропософская медицина" },
];

/**
 * Specialties of the other certified professions, from Cabinet Regulation No. 460 Annex 1
 * (as worded by Reg. No. 269, 06 May 2025, likumi.lv/ta/id/137108). These are not on the LĀB list.
 * Functional specialists: one specialty per profession, Medical Treatment Law Section 45.1(1).
 * Nurses are not certified (Medical Treatment Law Section 26(2)); their specializations come from education.
 */
export const OTHER_PROFESSION_SPECIALTIES: readonly Specialty[] = [
  { code: "pa-ems", lv: "Neatliekamās medicīnas ārsta palīgs (feldšeris)", en: "Emergency medicine physician assistant (paramedic)", ru: "Фельдшер неотложной медицинской помощи" },
  { code: "pa-amb", lv: "Ambulatorā dienesta ārsta palīgs", en: "Outpatient physician assistant", ru: "Фельдшер амбулаторной помощи" },
  { code: "midwife", lv: "Vecmāte", en: "Midwife", ru: "Акушерка" },
  { code: "fs-physio", lv: "Fizioterapeits", en: "Physiotherapist", ru: "Физиотерапевт" },
  { code: "fs-ot", lv: "Ergoterapeits", en: "Occupational therapist", ru: "Эрготерапевт" },
  { code: "fs-ortho", lv: "Tehniskais ortopēds", en: "Orthotist and prosthetist", ru: "Техник-ортопед" },
  { code: "fs-slt", lv: "Audiologopēds (klīniskais logopēds)", en: "Speech and language therapist", ru: "Аудиологопед (клинический логопед)" },
  { code: "fs-diet", lv: "Uztura speciālists", en: "Dietitian", ru: "Специалист по питанию" },
  { code: "fs-art", lv: "Mākslas terapeits", en: "Art therapist", ru: "Арт-терапевт" },
  { code: "fs-optom", lv: "Optometrists", en: "Optometrist", ru: "Оптометрист" },
  { code: "nu-gen", lv: "Māsa (vispārējās aprūpes māsa)", en: "General care nurse", ru: "Медсестра (общего ухода)" },
  { code: "nu-icu", lv: "Māsas specializācija anestēzijā un intensīvajā aprūpē", en: "Nurse, anaesthesia and intensive care", ru: "Медсестра, специализация: анестезия и интенсивная терапия" },
  { code: "nu-child", lv: "Māsas specializācija bērnu aprūpē", en: "Nurse, child care", ru: "Медсестра, специализация: уход за детьми" },
  { code: "nu-psych", lv: "Māsas specializācija psihiatrijā un narkoloģijā", en: "Nurse, psychiatry and addiction", ru: "Медсестра, специализация: психиатрия и наркология" },
  { code: "nu-periop", lv: "Māsas specializācija perioperatīvajā aprūpē", en: "Nurse, perioperative care", ru: "Медсестра, специализация: периоперационный уход" },
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
  BY_NAME.set(norm(s.ru), s.code);
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
