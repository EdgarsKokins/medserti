import { fold } from "./validate";

export interface Suggestion {
  /** text written into the field (Latvian: it goes into the LĀB documents) */
  value: string;
  /** small second line in the dropdown */
  hint?: string;
}

/*
 * Healthcare institutions: snapshot of "VKCP IĢIS - ārstniecības iestāžu adreses" (data.gov.lv, CC0 1.0,
 * dataset updated 07 Mar 2024): hospitals and family doctor practices with their code in the
 * Register of Healthcare Institutions. Not every institution is in it, so free text stays allowed.
 * Loaded on first use so it stays out of the page bundle.
 */
let institutions: Promise<{ n: string; c: string; p: string }[]> | null = null;
const loadInstitutions = () => (institutions ??= import("./institutions.json").then((m) => m.default as { n: string; c: string; p: string }[]));

/** Words of the query must all start a word in the name: "stradin kl" finds "P. Stradiņa klīniskā universitātes slimnīca" */
function matches(name: string, q: string[]): boolean {
  const words = fold(name).split(/[\s,.()"-]+/);
  return q.every((w) => words.some((x) => x.startsWith(w)) || fold(name).includes(w));
}

const terms = (q: string) => fold(q).split(/[\s,.-]+/).filter(Boolean);

export async function suggestInstitutions(q: string, limit = 8): Promise<Suggestion[]> {
  const t = terms(q);
  if (!t.length || q.trim().length < 2) return [];
  const list = await loadInstitutions();
  return list
    .filter((x) => matches(x.n, t) || x.c.startsWith(q.trim()))
    .slice(0, limit)
    .map((x) => ({ value: x.c ? `${x.n}, reģ. Nr. ${x.c}` : x.n, hint: [x.p, x.c].filter(Boolean).join(" · ") }));
}

/* Countries: ISO 3166-1 codes, names from the browser's Intl data, so no list to maintain */
const COUNTRY_CODES =
  "AD AE AF AG AI AL AM AO AR AS AT AU AW AZ BA BB BD BE BF BG BH BI BJ BM BN BO BR BS BT BW BY BZ CA CD CF CG CH CI CL CM CN CO CR CU CV CY CZ DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ FM FR GA GB GD GE GH GL GM GN GQ GR GT GW GY HK HN HR HT HU ID IE IL IN IQ IR IS IT JM JO JP KE KG KH KI KM KN KP KR KW KZ LA LB LC LI LK LR LS LT LU LY MA MC MD ME MG MK ML MM MN MR MT MU MV MW MX MY MZ NA NE NG NI NL NO NP NR NZ OM PA PE PG PH PK PL PR PS PT PW PY QA RO RS RU RW SA SB SC SD SE SG SI SK SL SM SN SO SR SS ST SV SY SZ TD TG TH TJ TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VN VU WS XK YE ZA ZM ZW".split(" ");

let countries: { lv: string; ui: string }[] | null = null;
function countryList(uiLocale: string) {
  if (countries) return countries;
  const lv = new Intl.DisplayNames(["lv"], { type: "region" });
  const ui = new Intl.DisplayNames([uiLocale], { type: "region" });
  countries = COUNTRY_CODES.map((c) => ({ lv: lv.of(c) ?? c, ui: ui.of(c) ?? c })).sort((a, b) => a.lv.localeCompare(b.lv, "lv"));
  return countries;
}

export async function suggestCountries(q: string, uiLocale: string, limit = 8): Promise<Suggestion[]> {
  const t = terms(q);
  if (!t.length) return [];
  return countryList(uiLocale)
    .filter((c) => matches(c.lv, t) || matches(c.ui, t))
    .slice(0, limit)
    .map((c) => ({ value: c.lv, hint: c.ui !== c.lv ? c.ui : undefined }));
}
