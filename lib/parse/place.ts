import type { CmeCategory } from "../types";
import { looksLatvian, rx, type Text } from "./text";

/** Country patterns on folded text (LV, EN, local names, cities, postcodes) -> ISO 3166-1 alpha-2 code */
const ABROAD: [RegExp, string][] = [
  [/lietuv\p{L}*|lithuania|lietuvos|vilnius|vilni\p{L}*|kaun\p{L}*|klaiped\p{L}*|siauli\p{L}*|palang\p{L}*|lt-\d{5}/u, "LT"],
  [/igaunij\p{L}*|estonia|eesti|tallin\p{L}*|tartu|parnu/u, "EE"],
  [/somij\p{L}*|finland|suomi|helsink\p{L}*|tampere|turku|oulu/u, "FI"],
  [/zviedrij\p{L}*|sweden|sverige|stockholm|stokholm\p{L}*|goteborg|gothenburg|malmo|uppsala/u, "SE"],
  [/norvegij\p{L}*|norway|norge|oslo|bergen/u, "NO"],
  [/danij\p{L}*|denmark|danmark|copenhagen|kobenhavn|kopenhagen\p{L}*|aarhus/u, "DK"],
  [/islande|iceland|reykjavik/u, "IS"],
  [/polij\p{L}*|poland|polska|warsaw|warszaw\p{L}*|varsav\p{L}*|krakow|gdansk|wroclaw|poznan/u, "PL"],
  [/vacij\p{L}*|germany|deutschland|berlin\p{L}*|munchen|munich|hamburg|frankfurt|koln|cologne|dusseldorf|leipzig|dresden|heidelberg|stuttgart/u, "DE"],
  [/austrij\p{L}*|austria|osterreich|vienna|wien|vin\p{L}*|salzburg|innsbruck|graz/u, "AT"],
  [/sveic\p{L}*|switzerland|schweiz|suisse|geneva|geneve|zenev\p{L}*|zurich|cirih\p{L}*|basel|bern|lausanne|davos/u, "CH"],
  [/niderland\p{L}*|netherlands|nederland|holland|amsterdam\p{L}*|rotterdam|utrecht|leiden|the hague|den haag|maastricht/u, "NL"],
  [/belgij\p{L}*|belgium|belgique|brussels|bruxelles|brisel\p{L}*|antwerp|ghent|leuven/u, "BE"],
  [/luksemburg\p{L}*|luxembourg/u, "LU"],
  [/francij\p{L}*|france|paris|pariz\p{L}*|lyon|marseille|nice|strasbourg|bordeaux|toulouse|annecy|lille|montpellier/u, "FR"],
  [/spanij\p{L}*|spain|espana|barcelon\p{L}*|madrid\p{L}*|valencia|seville|sevilla|malaga/u, "ES"],
  [/portugal\p{L}*|lisbon|lisboa|lisabon\p{L}*|porto/u, "PT"],
  [/italij\p{L}*|italy|italia|rome|roma|milan|milano|milan\p{L}*|florence|firenze|bologna|turin|torino|naples|napoli|venice|venezia|verona|padova|padua|genova/u, "IT"],
  [/griekij\p{L}*|greece|athens|aten\p{L}*|thessaloniki/u, "GR"],
  [/kipr\p{L}*|cyprus|nicosia|limassol/u, "CY"],
  [/malta|valletta/u, "MT"],
  [/cehij\p{L}*|czech|cesk\p{L}*|prague|praha|prag\p{L}*|brno/u, "CZ"],
  [/slovakij\p{L}*|slovakia|bratislav\p{L}*|kosice/u, "SK"],
  [/ungarij\p{L}*|hungary|magyarorszag|budapest\p{L}*|debrecen|szeged/u, "HU"],
  [/slovenij\p{L}*|slovenia|ljubljan\p{L}*/u, "SI"],
  [/horvatij\p{L}*|croatia|hrvatska|zagreb|split|dubrovnik/u, "HR"],
  [/rumanij\p{L}*|romania|bucharest|bucuresti|bukares\p{L}*|cluj/u, "RO"],
  [/bulgarij\p{L}*|bulgaria|sofia|sofij\p{L}*|varna/u, "BG"],
  [/serbij\p{L}*|serbia|belgrade|beograd/u, "RS"],
  [/irij\p{L}*|ireland|dublin|cork|galway/u, "IE"],
  [/lielbritanij\p{L}*|united kingdom|great britain|england|scotland|wales|london\p{L}*|edinburgh|manchester|birmingham|glasgow|oxford|cambridge|liverpool/u, "GB"],
  [/ukrain\p{L}*|kyiv|kiev|lviv|lvov\p{L}*|украин\p{L}*|киев/u, "UA"],
  [/gruzij\p{L}*|georgia(?!\s+state)|tbilisi/u, "GE"],
  [/turcij\p{L}*|turkey|turkiye|istanbul|stambul\p{L}*|ankara|antalya/u, "TR"],
  [/izrael\p{L}*|israel|tel aviv|jerusalem/u, "IL"],
  [/uzbekist\p{L}*|tashkent|taskent\p{L}*|samarkand|узбекистан\p{L}*|ташкент\p{L}*/u, "UZ"],
  [/kazahstan\p{L}*|kazakhstan|almaty|astana|казахстан\p{L}*|алматы|астана/u, "KZ"],
  [/amerikas savienot\p{L}*|united states|u\.s\.a\.?|new york|boston|chicago|san francisco|los angeles|washington,?\s*d\.?c/u, "US"],
  [/kanad\p{L}*|canada|toronto|montreal|vancouver/u, "CA"],
  [/apvienotie arabu|united arab emirates|dubai|abu dhabi/u, "AE"],
];
const LATVIA =
  /latvij|latvia|rig[aāoe](?![\p{L}])|riga|rigas|liepaj|daugavpil|jelgav|ventspil|valmier|rezekn|jurmal|ogr[eē](?![\p{L}])|tukum|cesis|cesu|sigulda|kuldig|kandav|saldus|jekabpil|bausk|dobel|talsi|limbaz|aizkraukl|madon|gulben|aluksn|balv(?![\p{L}])|kraslav|preil|ludz|smilten|kronauc|lv-\d{4}/u;
/** approved by the Latvian Medical Association: a Latvian event wherever its venue line points */
const LV_APPROVAL = /lab sertifikacijas|sertifikacijas padom|lab \d|latvijas arstu biedrib|arstu biedribas sertifikacijas|tip ?(?:19|20)\d{2}\/\d{2,5}|mk noteikum|ministru kabineta/u;

const countryOf = (line: string): string | null => {
  for (const [re, country] of ABROAD) if (rx(`(?<![\\p{L}])(?:${re.source})`, "u").test(line)) return country;
  return null;
};

/** Country of the event and how sure we are. Looks at place and date lines first, so "Lithuanian Society of ..." is not a venue. */
export function findCountry(t: Text): { value: string | null; confidence: number } {
  const lines = t.fold.split("\n");
  const placeLines = lines.filter((l) =>
    /noris|vieta|notika|datum|place|venue|held|location|(?:19|20)\d{2}|adrese|address|iela|str\.|tel\.?:|[a-z]{2}-\d{4,5}|prague|paris/u.test(l),
  );
  for (const l of placeLines) {
    if (LATVIA.test(l)) continue;
    const c = countryOf(l);
    if (c) return { value: c, confidence: 0.85 };
  }
  // "USA" in capitals only: OCR splits words into syllables ("Sin usa ta hi ka rd ija")
  if (/(?<![\p{L}])USA(?![\p{L}])/u.test(t.raw)) return { value: "US", confidence: 0.7 };
  // Latvian approval number or a Latvian place: Latvia
  if (LATVIA.test(t.fold) || LV_APPROVAL.test(t.flat)) return { value: "LV", confidence: LV_APPROVAL.test(t.flat) ? 0.9 : 0.8 };
  // no place line named a country: take the first country named anywhere, outside society names
  for (const l of lines) {
    if (/society|association|federation|biedrib|asociacij/u.test(l)) continue;
    const c = countryOf(l);
    if (c) return { value: c, confidence: 0.6 };
  }
  // written in Latvian, nothing else: most likely Latvia
  if (looksLatvian(t)) return { value: "LV", confidence: 0.6 };
  return { value: null, confidence: 0 };
}

const CATEGORY_RULES: [CmeCategory, RegExp][] = [
  ["e_learning", /e-macib|tiessaist|attalinat|webinar|vebinar|e-kurs|online|e-learning|virtual|distance\s+learning/u],
  // "klīniskā prakse", not any "praksē" ("Kā praksē samazināt ..." is a seminar title)
  ["practical_training", /klinisk\p{L}*\s+prakse(?![\p{L}])|praktisk\p{L}*\s+apmacib|stazesan|internship|clinical\s+(?:attachment|placement)/u],
  ["interdisciplinary_conference", /starpdisciplin\p{L}*\s+konferenc|interdisciplinary\s+conference/u],
  ["professional_meeting", /biedribas\s+sed|asociacijas\s+sed|society\s+meeting|association\s+meeting/u],
];

export function findCategory(t: Text, country: string | null): CmeCategory {
  const abroad = country && country !== "LV";
  // order matters: delivery mode and practical training beat location; location beats event type
  for (const [category, re] of CATEGORY_RULES) {
    if (category === "interdisciplinary_conference" && abroad) continue;
    if (re.test(t.fold)) return category;
  }
  return abroad ? "training_abroad" : "training_latvia";
}

const EMERGENCY = [
  /neatliekam/u,
  /pirm\p{L}*\s+palidzib/u,
  /reanimacij|atdzivinasan/u,
  /emergency|resuscitation|first\s+aid|life\s+support/u,
];

export function isEmergencyCare(t: Text): boolean {
  return EMERGENCY.some((re) => re.test(t.fold)) || /(?<![\p{L}])(?:BLS|ALS|ACLS|PALS|EPALS|ATLS|CPR)(?![\p{L}])/u.test(t.raw);
}

/** The holder spoke, not just attended: Annex 4 items 22 and 23 count talks separately */
export function isLecturer(t: Text): boolean {
  return /(?:has been|as) an? (?:lecturer|speaker|moderator)|presented a (?:lecture|talk|report)|invited (?:speaker|lecturer)|lecturer and moderator|ka lektor|lektora statusa|uzstaj\p{L}* ar (?:zinojum|priekslasijum)|visiting surgeon and lecturer|operating surgeon/u.test(t.flat)
    || /провел\p{L}* .{0,30}мастер-класс/u.test(t.flat);
}
