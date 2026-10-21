import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";
import type { NurseTopic } from "../types";

/*
 * Recertification documents in the structure of Cabinet Regulation No. 391, Annex 3 ("Resertifikācijas lapa")
 * and LĀB's application template ("Resertificējamās personas iesniegums"). Always Latvian: they go to LĀB.
 * Pure functions with no server imports, so they run in the browser and nothing personal leaves the device.
 */

export interface ExportWorkplace {
  name: string;
  position: string;
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD or "" = to date
}

export interface ExportPerson {
  firstName: string;
  lastName: string;
  personalCode: string;
  practitionerId: string;
  address: string;
  phone: string;
  email: string;
  notifyBy: "email" | "eaddress";
  commission: string;
  workplaces: ExportWorkplace[];
  abroad: { country: string; workplace: ExportWorkplace; noMisconduct: boolean } | null;
  languageDoc: boolean;
  earlierActivities: boolean;
  paperCertificate: boolean;
  /** the person ticked the item 14 statements and the register confirmation themselves */
  declarations: boolean;
}

export interface ExportCertificate {
  approvalId: string | null;
  organizer: string;
  title: string;
  date: string; // YYYY-MM-DD
  endDate: string | null;
  points: number;
  inSpecialty: boolean;
}

export interface ExportCertificateInfo {
  number: string;
  validUntil: string | null; // YYYY-MM-DD
  specialty: string; // specialty or method as on the certificate
}

const FONT = "Times New Roman";
const SIZE = 22; // half-points: 11 pt

/** "2025-09-25" -> "25.09.2025." */
export const lvDate = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}.` : "");
const dates = (c: ExportCertificate) => (c.endDate && c.endDate !== c.date ? `${lvDate(c.date)}-${lvDate(c.endDate)}` : lvDate(c.date));
const num = (n: number) => (Math.round(n * 10) / 10).toString().replace(".", ",");
const box = (on: boolean) => (on ? "☒" : "☐");
const line = (v: string | null | undefined, blank = "________________") => (v && v.trim() ? v.trim() : blank);

const p = (text: string, opts: { bold?: boolean; size?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; italic?: boolean; space?: number } = {}) =>
  new Paragraph({
    alignment: opts.align,
    spacing: { after: opts.space ?? 80 },
    children: [new TextRun({ text, bold: opts.bold, italics: opts.italic, font: FONT, size: opts.size ?? SIZE })],
  });

/** "13.2." label + value on one line, value bold so the filled data stands out from the form text */
const field = (label: string, value: string) =>
  new Paragraph({
    spacing: { after: 80 },
    children: [
      ...(label ? [new TextRun({ text: `${label} `, font: FONT, size: SIZE })] : []),
      new TextRun({ text: value, bold: true, font: FONT, size: SIZE }),
    ],
  });

const thin = { style: BorderStyle.SINGLE, size: 4, color: "000000" };
const cell = (text: string, opts: { bold?: boolean; width?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; shade?: boolean } = {}) =>
  new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    shading: opts.shade ? { fill: "D9D9D9" } : undefined,
    borders: { top: thin, bottom: thin, left: thin, right: thin },
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
    children: [new Paragraph({ alignment: opts.align, children: [new TextRun({ text, bold: opts.bold, font: FONT, size: 20 })] })],
  });

const COLS: [string, number][] = [
  ["Nr. p. k.", 7],
  ["Izziņas numurs", 15],
  ["Pasākuma organizators", 22],
  ["Pasākuma nosaukums", 32],
  ["Pasākuma norises datums(-i)", 14],
  ["Stundu/tālākizglītības punktu skaits", 10],
];

function activityTable(rows: ExportCertificate[]): Table {
  const head = new TableRow({ tableHeader: true, children: COLS.map(([t, w]) => cell(t, { bold: true, width: w, shade: true })) });
  const body = rows.map(
    (c, i) =>
      new TableRow({
        children: [
          cell(String(i + 1), { align: AlignmentType.CENTER }),
          cell(c.approvalId ?? ""),
          cell(c.organizer),
          cell(c.title),
          cell(dates(c)),
          cell(num(c.points), { align: AlignmentType.RIGHT }),
        ],
      }),
  );
  const total = rows.reduce((a, c) => a + c.points, 0);
  const sum = new TableRow({
    children: [
      new TableCell({ columnSpan: 5, borders: { top: thin, bottom: thin, left: thin, right: thin }, margins: { top: 40, bottom: 40, left: 80, right: 80 }, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "Kopā", bold: true, font: FONT, size: 20 })] })] }),
      cell(num(total), { bold: true, align: AlignmentType.RIGHT }),
    ],
  });
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [head, ...(body.length ? body : [new TableRow({ children: COLS.map(() => cell("")) })]), sum] });
}

const workplaceLines = (no: string, w: ExportWorkplace | undefined) => [
  field(`${no} darbavieta (ārstniecības iestādes, struktūrvienības nosaukums un ārstniecības iestādes reģistrācijas numurs):`, line(w?.name)),
  field("amats:", line(w?.position)),
  field("darba attiecības laikposmā no", `${line(lvDate(w?.from), "__________")} līdz ${w ? (w.to ? lvDate(w.to) : "šim brīdim") : "__________"}`),
];

/** Annex 3, Part I filled from the profile, the export form and confirmed certificates; Parts II and III left for the commission */
export function buildRecertificationSheet(person: ExportPerson, cert: ExportCertificateInfo, certs: ExportCertificate[]): Document {
  const own = certs.filter((c) => c.inSpecialty).sort((a, b) => a.date.localeCompare(b.date));
  const other = certs.filter((c) => !c.inSpecialty).sort((a, b) => a.date.localeCompare(b.date));
  const children = [
    p("3. pielikums Ministru kabineta 2024. gada 18. jūnija noteikumiem Nr. 391", { align: AlignmentType.RIGHT, size: 18, italic: true }),
    p("Resertifikācijas lapa", { bold: true, size: 30, align: AlignmentType.CENTER, space: 200 }),
    p("I. Resertificējamās ārstniecības personas dati", { bold: true, space: 120 }),
    field("1. Vārds (vārdi):", line(person.firstName)),
    field("2. Uzvārds:", line(person.lastName)),
    field("3. Personas kods:", line(person.personalCode)),
    field("4. Ārstniecības personas identifikatora numurs:", line(person.practitionerId)),
    field("5. Deklarētās dzīvesvietas adrese:", line(person.address)),
    field("6. Tālruņa numurs (numuri):", line(person.phone)),
    field("7. Oficiālā elektroniskā adrese vai elektroniskā pasta adrese:", line(person.email)),
    p(
      `8. Piekrītu, ka lēmums tiek paziņots ar elektroniskā pasta starpniecību uz manis norādīto: ${box(person.notifyBy === "eaddress")} oficiālo elektronisko adresi  ${box(person.notifyBy === "email")} elektroniskā pasta adresi`,
    ),
    p("9. Informācija par sertifikātu specialitātē, apakšspecialitātē, papildspecialitātē vai ārstnieciskajā vai diagnostiskajā metodē, kurā tiek veikta resertifikācija:"),
    field("9.1. numurs:", line(cert.number)),
    field("9.2. derīguma termiņš (dd.mm.gggg.):", line(lvDate(cert.validUntil))),
    field("9.3. specialitāte, apakšspecialitāte vai papildspecialitāte, kurā izsniegts sertifikāts:", line(cert.specialty)),
    field("10. Sertifikācija nepieciešama:", line(cert.specialty)),
    p("11. Profesionālās darbības pieredze sertifikāta derīguma termiņa laikā (norāda visas ārstniecības iestādes, kurās persona strādā vai ir strādājusi):"),
    ...workplaceLines("11.1.", person.workplaces[0]),
    ...workplaceLines("11.2.", person.workplaces[1]),
    p(
      `11.3. ${box(!!person.abroad)} sertifikāta derīguma termiņa laikā esmu veicis(-usi) profesionālo darbību ārvalstīs: ${line(person.abroad?.country, "__________")}`,
    ),
    ...(person.abroad
      ? [...workplaceLines("", person.abroad.workplace), p(`${box(person.abroad.noMisconduct)} man nav profesionālās darbības pārkāpumu ārvalstīs`)]
      : []),
    p(`12. Valsts valodas prasme: ${person.languageDoc ? "pievienots valsts valodas prasmi apliecinošs dokuments" : "________________"}`),
    p("13. Informācija par profesionālo un zinātnisko darbību un tālākizglītības pasākumiem sertifikāta derīguma termiņa laikā²:"),
    p(`13.1. ir iepriekšējā perioda tālākizglītības pasākumi, kas ņemami vērā šajā resertifikācijas periodā: ${box(person.earlierActivities)} jā  ${box(!person.earlierActivities)} nē`),
    p("13.2. informācija par tālākizglītības pasākumiem specialitātē vai ārstnieciskajā vai diagnostiskajā metodē, kurā tiek veikta resertifikācija:"),
    activityTable(own),
    p("", { space: 120 }),
    p("13.3. informācija par pārējiem tālākizglītības punktiem:"),
    activityTable(other),
    p("", { space: 120 }),
    p("14. Apliecinu³:"),
    p(`${box(person.declarations)} man nav tiesas noteikta ierobežojuma tiesībām veikt ārstniecību`),
    p(`${box(person.declarations)} neesmu nodots(-a) citas personas aizgādnībā`),
    p(`${box(person.declarations)} man nav piemērots prokurora priekšraksts par ierobežojumu veikt ārstniecību kā sods krimināllietā`),
    field("15. Datums (dd.mm.gggg.)⁴:", "______________"),
    field("16. Resertificējamās ārstniecības personas paraksts⁴:", "______________"),
    p("", { space: 200 }),
    p("II. Priekšlikums attiecībā uz resertifikāciju⁵", { bold: true }),
    p("17.-23. Aizpilda sertifikācijas komisija.", { italic: true }),
    p("III. Lēmums attiecībā uz resertifikāciju⁷", { bold: true }),
    p("24.-29. Aizpilda sertifikācijas padome.", { italic: true, space: 240 }),
    p("Piezīmes.", { bold: true, size: 18 }),
    p("¹ Aizpilda ārstniecības persona.", { size: 18 }),
    p("² Pievieno tālākizglītības pasākumus apliecinošu dokumentu kopijas, kas apliecinātas normatīvajos aktos par dokumentu izstrādāšanu un noformēšanu noteiktajā kārtībā, vai uzrāda oriģinālus.", { size: 18 }),
    p("³ Ārstniecības persona atzīmē atbilstošo.", { size: 18 }),
    p("⁴ Dokumenta rekvizītus „paraksts” un „datums” neaizpilda, ja elektroniskais dokuments ir sagatavots atbilstoši normatīvajiem aktiem par elektronisko dokumentu noformēšanu.", { size: 18 }),
    p("Sagatavots ar Medserti (medserti.lv). Pirms iesniegšanas pārbaudiet datus.", { size: 16, italic: true }),
  ];
  return new Document({
    creator: "Medserti",
    title: "Resertifikācijas lapa",
    styles: { default: { document: { run: { font: FONT, size: SIZE } } } },
    sections: [{ properties: { page: { margin: { top: 1000, bottom: 1000, left: 1100, right: 1000 } } }, children }],
  });
}

/** LĀB's "Resertificējamās personas iesniegums": the cover application for the commission */
export function buildApplication(person: ExportPerson, cert: ExportCertificateInfo, certCount: number): Document {
  const children = [
    p("Resertificējamās personas iesniegums", { bold: true, size: 28, align: AlignmentType.CENTER, space: 240 }),
    p("Latvijas Ārstu biedrības", { align: AlignmentType.RIGHT }),
    field("", line(person.commission, "_______________________________")),
    p("(sertifikācijas komisijas nosaukums)", { size: 16, italic: true }),
    p("sertifikācijas komisijai", { space: 200 }),
    field("", `${person.firstName} ${person.lastName}, ${line(person.personalCode, "__________")}, ${line(person.phone, "__________")}`),
    p("(vārds, uzvārds, personas kods, tālruņa numurs)", { size: 16, italic: true }),
    p("lūdzu izskatīt klātpievienotos dokumentus ārstniecības personas sertifikāta iegūšanai", { space: 120 }),
    field("", line(cert.specialty)),
    p("(specialitātes, apakšspecialitātes, papildspecialitātes, ārstnieciskās vai diagnostiskās metodes nosaukums)", { size: 16, italic: true, space: 200 }),
    p("Iesniegumam pievienoju sekojošus dokumentus (atzīmēt atbilstošo):"),
    p(`${box(true)} resertifikācijas lapu (uz ____ lapas pusēm);`),
    p(`${box(false)} profesionālās darbības pārskatu (uz ____ lapas pusēm);`),
    p(`${box(certCount > 0)} izglītības dokumenta kopijas par profesionālo un zinātnisko darbību un tālākizglītības pasākumiem (${certCount});`),
    p(`${box(person.languageDoc)} dokumenta kopiju, kas apliecina valsts valodas prasmi¹`),
    p(`${box(false)} maksājumu apliecinoša dokumenta kopiju par resertifikācijas procesa apmaksu;`),
    p(`${box(false)} citi ______________________________`),
    p(`${box(person.declarations)} Apliecinu, ka esmu reģistrēts/-a Latvijas ārstniecības personu reģistrā.`),
    p(`${box(person.paperCertificate)} Sertifikātu vēlos saņemt papīra formā.²`, { space: 240 }),
    p("Datums ____________________"),
    p("Paraksts un paraksta atšifrējums ___________________________________", { space: 300 }),
    p("Iesniegumu un dokumentus pieņēma un ar oriģināliem iepazinās:"),
    p("_____________________________________________________________"),
    p("(paraksts un paraksta atšifrējums)", { size: 16, italic: true }),
    p("Datums ___________________________________", { space: 240 }),
    p("Skaidrojumi:", { bold: true, size: 18 }),
    p("Kopijas iesniedzamas uzrādot oriģinālu", { size: 18 }),
    p("¹ - ja to nosaka Valsts valodas likuma prasības;", { size: 18 }),
    p("² - Sertifikātu papīra formā izsniedz sertifikācijas institūcija par maksu saskaņā ar maksas pakalpojumu cenrādi pēc ārstniecības personas rakstveida pieprasījuma saņemšanas.", { size: 18 }),
  ];
  return new Document({
    creator: "Medserti",
    title: "Resertificējamās personas iesniegums",
    styles: { default: { document: { run: { font: FONT, size: SIZE } } } },
    sections: [{ properties: { page: { margin: { top: 1100, bottom: 1000, left: 1200, right: 1100 } } }, children }],
  });
}

// ----- nurses: Health Inspectorate re-registration, Cabinet Regulation No. 630 -----

/** A nurse's course row: Annex 4 item 9 has no approval-number column, the Reg. 630 point 26.3 topic goes with the title */
export interface NurseExportCertificate {
  organizer: string;
  title: string;
  date: string; // YYYY-MM-DD
  endDate: string | null;
  hours: number;
  topic: NurseTopic;
}

export interface NursePerson {
  firstName: string;
  lastName: string;
  practitionerId: string;
  address: string;
  phone: string;
  email: string;
  notifyBy: "email" | "eaddress";
}

/** Latvian topic names for the VI documents; "other" adds nothing to the title */
const NURSE_TOPIC_LV: Record<NurseTopic, string | null> = {
  emergency: "neatliekamā medicīniskā palīdzība",
  infection_control: "infekciju kontrole",
  patient_safety: "pacientu drošība",
  nursing: "māsas kompetences tēma",
  other: null,
};

const NURSE_COLS: [string, number][] = [
  ["Nr. p. k.", 7],
  ["Pasākuma realizētājs", 28],
  ["Pasākuma nosaukums (tēma)", 39],
  ["Pasākuma norises datums(-i)", 14],
  ["Stundu apjoms", 12],
];

function nurseTable(rows: NurseExportCertificate[]): Table {
  const head = new TableRow({ tableHeader: true, children: NURSE_COLS.map(([t, w]) => cell(t, { bold: true, width: w, shade: true })) });
  const body = rows.map(
    (c, i) =>
      new TableRow({
        children: [
          cell(String(i + 1), { align: AlignmentType.CENTER }),
          cell(c.organizer),
          cell(NURSE_TOPIC_LV[c.topic] ? `${c.title} (${NURSE_TOPIC_LV[c.topic]})` : c.title),
          cell(c.endDate && c.endDate !== c.date ? `${lvDate(c.date)}-${lvDate(c.endDate)}` : lvDate(c.date)),
          cell(num(c.hours), { align: AlignmentType.RIGHT }),
        ],
      }),
  );
  const total = rows.reduce((a, c) => a + c.hours, 0);
  const sum = new TableRow({
    children: [
      new TableCell({ columnSpan: 4, borders: { top: thin, bottom: thin, left: thin, right: thin }, margins: { top: 40, bottom: 40, left: 80, right: 80 }, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "Kopā:", bold: true, font: FONT, size: 20 })] })] }),
      cell(num(total), { bold: true, align: AlignmentType.RIGHT }),
    ],
  });
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [head, ...(body.length ? body : [new TableRow({ children: NURSE_COLS.map(() => cell("")) })]), sum] });
}

/** Reg. 630 Annex 4 "Iesniegums pārreģistrācijai vai reģistrācijas atjaunošanai", items 1-9 and 12-13 */
export function buildReRegistration(person: NursePerson, profession: string, rows: NurseExportCertificate[]): Document {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const children = [
    p("4. pielikums Ministru kabineta 2024. gada 1. oktobra noteikumiem Nr. 630", { align: AlignmentType.RIGHT, size: 18, italic: true }),
    p("Iesniegums pārreģistrācijai vai reģistrācijas atjaunošanai", { bold: true, size: 28, align: AlignmentType.CENTER, space: 200 }),
    field("1. Vārds(-i):", line(person.firstName)),
    field("2. Uzvārds:", line(person.lastName)),
    field("3. Ārstniecības personas vai ārstniecības atbalsta personas identifikators:", line(person.practitionerId)),
    field("4. Korespondences adrese:", line(person.address)),
    field("5. Tālruņa numurs (numuri):", line(person.phone)),
    field("6. Oficiālā elektroniskā adrese un/vai elektroniskā pasta adrese:", line(person.email)),
    p(
      `7. Piekrītu, ka informācija par reģistrāciju (tai skaitā lēmumi) tiek paziņota ar elektroniskā pasta starpniecību uz manis norādīto: ${box(person.notifyBy === "eaddress")} oficiālo elektronisko adresi  ${box(person.notifyBy === "email")} elektroniskā pasta adresi`,
    ),
    p("8. Nepieciešams (vajadzīgo norādīt):"),
    field(`8.1. ${box(true)} veikt pārreģistrāciju:`, profession),
    p(`8.2. ${box(false)} atjaunot reģistrāciju`),
    p("9. Informācija par profesionālo zināšanu vai prasmju apguvi vai pilnveidi attiecīgajā profesijā:"),
    nurseTable(sorted),
    p("", { space: 120 }),
    p("10. Informācija par sekmīgi nokārtotu profesionālās atbilstības pārbaudi attiecīgajā profesijā: nav aizpildāms"),
    p("11. Informācija par darba pieredzi Eiropas Ekonomikas zonas dalībvalstīs vai Šveices Konfederācijā: nav aizpildāms", { space: 200 }),
    field("12. Datums (dd.mm.gggg.)*:", "______________"),
    field("13. Ārstniecības personas paraksts*:", "______________", ),
    p("", { space: 200 }),
    p("Piezīme. * Neaizpilda, ja elektroniskais dokuments sagatavots atbilstoši normatīvajiem aktiem par elektronisko dokumentu noformēšanu.", { size: 18 }),
    p("Sagatavots ar Medserti (medserti.lv). Pirms iesniegšanas pārbaudiet datus.", { size: 16, italic: true }),
  ];
  return new Document({
    creator: "Medserti",
    title: "Iesniegums pārreģistrācijai",
    styles: { default: { document: { run: { font: FONT, size: SIZE } } } },
    sections: [{ properties: { page: { margin: { top: 1000, bottom: 1000, left: 1100, right: 1000 } } }, children }],
  });
}

/** Checklist for the ZIP: hours per point 26.3 topic against the 2027 minimums */
export function buildNurseChecklist(
  rows: NurseExportCertificate[],
  registrationUntil: string | null,
  skipped: number,
  minimums: { emergency: number; infection_control: number; patient_safety: number; nursing: number; total: number; from: string },
): string {
  const sum = (t?: NurseTopic) => rows.filter((r) => !t || r.topic === t).reduce((a, r) => a + r.hours, 0);
  const applies = !!registrationUntil && registrationUntil >= minimums.from;
  const rowLine = (label: string, have: number, need: number | null) =>
    `  ${have >= (need ?? 0) || need == null ? "[x]" : "[ ]"} ${label}: ${num(have)}${need != null ? ` no ${need}` : ""}`;
  return [
    "Medserti: pārreģistrācijas dokumenti (Veselības inspekcija)",
    "",
    "Šajā mapē:",
    "  1_Iesniegums_parregistracijai.docx   MK noteikumu Nr. 630 4. pielikums",
    `  2_Sertifikati/                       ${rows.length} apliecinājumu kopijas`,
    "",
    ...(skipped > 0
      ? [`Uzmanību: ${skipped} sertifikāti vēl nav apstiprināti Medserti un nav iekļauti. Apstipriniet tos un sagatavojiet dokumentus vēlreiz.`, ""]
      : []),
    "Akadēmiskās stundas (MK noteikumi Nr. 630, 25. un 26.3. punkts):",
    rowLine("Kopā", sum(), minimums.total),
    ...(applies
      ? [
          rowLine("Neatliekamā medicīniskā palīdzība", sum("emergency"), minimums.emergency),
          rowLine("Infekciju kontrole", sum("infection_control"), minimums.infection_control),
          rowLine("Pacientu drošība", sum("patient_safety"), minimums.patient_safety),
          rowLine("Māsas kompetences tēmas", sum("nursing"), minimums.nursing),
        ]
      : [rowLine("Neatliekamā medicīniskā palīdzība", sum("emergency"), null)]),
    "",
    "No 2027. gada 1. janvāra VI ieskaita tikai LĀB, LĀPOS vai LMA apstiprinātus kursus (47. punkts);",
    "kursi līdz 2026. gada 31. decembrim skaitās arī bez tā (65. punkts).",
    "",
    "Vēl jāizdara:",
    "  [ ] Paraksts un datums iesniegumā (vai drošs elektroniskais paraksts eParaksts)",
    `  [ ] Iesniegt Veselības inspekcijā${registrationUntil ? ` līdz reģistrācijas termiņa beigām (${lvDate(registrationUntil)})` : ""}: https://www.vi.gov.lv`,
    "",
    "Pārbaudiet visus datus pirms iesniegšanas. Lēmumu pieņem Veselības inspekcija.",
  ].join("\r\n");
}

/** Three months before expiry: the regulation's last day to apply (point 46) */
export function applyByDate(validUntil: string | null): string | null {
  if (!validUntil) return null;
  const d = new Date(validUntil + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() - 3);
  return d.toISOString().slice(0, 10);
}

/** Plain-text checklist that goes into the ZIP next to the documents */
export function buildChecklist(cert: ExportCertificateInfo, included: number, skipped: number): string {
  const by = applyByDate(cert.validUntil);
  return [
    "Medserti: resertifikācijas dokumenti",
    "",
    "Šajā mapē:",
    "  1_Iesniegums.docx              iesniegums sertifikācijas komisijai",
    "  2_Resertifikacijas_lapa.docx   3. pielikums, I daļa aizpildīta",
    `  3_Sertifikati/                 ${included} tālākizglītības apliecinājumu kopijas`,
    "",
    ...(skipped > 0
      ? [`Uzmanību: ${skipped} sertifikāti vēl nav apstiprināti Medserti un nav iekļauti. Apstipriniet tos un sagatavojiet dokumentus vēlreiz.`, ""]
      : []),
    "Vēl jāpievieno pirms iesniegšanas:",
    "  [ ] Profesionālās darbības pārskats, ko apstiprinājis ārstniecības iestādes vadītājs",
    "      (vērtēšanas kritēriji pa specialitātēm: https://www.arstubiedriba.lv/kriteriji/)",
    "  [ ] Maksājuma apliecinājums par resertifikāciju (LĀB cenrādis: EUR 48,38;",
    "      rekvizīti: https://www.arstubiedriba.lv/sertifikacija/)",
    "  [ ] Valsts valodas prasmes dokuments, ja tas nepieciešams (pirmajā resertifikācijā)",
    "  [ ] Paraksts un datums abos dokumentos (vai droši elektroniski paraksts eParaksts)",
    "",
    `Iesniegšanas termiņš: ne vēlāk kā 3 mēnešus pirms sertifikāta derīguma beigām${by ? `, t.i. līdz ${lvDate(by)}` : ""}`,
    "(MK noteikumi Nr. 391, 46. punkts).",
    "Iesniegt var e-pakalpojumā: https://latvija.gov.lv/Services/6463",
    "",
    "Pārbaudiet visus datus pirms iesniegšanas. Lēmumu pieņem sertifikācijas institūcija.",
  ].join("\r\n");
}

export const toBlob = (doc: Document) => Packer.toBlob(doc);
export const toBuffer = (doc: Document) => Packer.toBuffer(doc);
