import { collapse, fold, rx, type Text } from "./text";

// ----- title -----

const QUOTES = [
  /„([^“”"\n]{0,200}(?:\n[^“”"\n]{0,200}){0,2})[“”"]/gu,
  /«([^»]{4,300})»/gu,
  /“([^”]{4,300})”/gu,
  /"([^"]{4,300})"/gu,
  // OCR turns typographic quotes into two apostrophes: ''Karpālais kanāls''
  /(?:''|’’|‘‘)([^'\n]{4,200}(?:\n[^'\n]{1,200}){0,2})(?:''|’’|“|”)/gu,
];
const ORG_PREFIX = /(?<![\p{L}])(?:SIA|AS|VSIA|NRC|biedrība|nodibinājums|Ltd|LLC|GmbH|Inc|institution|iestāde)\.?\s*$/iu;
/** quoted text that is not a title: regulation names, people, approval lines (OCR mispairs quotes across lines) */
const NOT_TITLE = /nolikum|noteikum|kartib|kortib|sertifik|ministr|(?<![\p{L}])(?:dr|prof|asoc)\.|(?<![\p{L}])lab(?![\p{L}])|(?<![\p{L}])tip|\d{4}\//u;

const EVENT_NOUN = "(?:kursa|konference|seminara|apmaciba|programma|kongresa|darbnica|meistarklase|lekcij\\p{L}*|vebinara|sede|paneldiskusija|forum\\p{L}*|akademij\\p{L}*)";
const TITLE_ANCHORS = [
  rx(`par\\s+(?:sekmigu\\s+)?(?:piedalisanos|dalibu)(?:\\s+${EVENT_NOUN})?`, "u"),
  rx(`(?:ir\\s+)?(?:piedalij\\p{L}*|apmeklej\\p{L}*|apguv\\p{L}*|noklausij\\p{L}*|dalyvavo)(?:\\/-?\\p{L}+)?(?:\\s+(?:talakizglitibas|profesionalas\\s+pilnveides|starptautiskaja|zinatniski\\s+praktiskaja|izglitojosa))?(?:\\s+${EVENT_NOUN})?:?`, "u"),
  /(?:participated\s+in|attended|has\s+completed|completed|for\s+attending|successfully\s+completed|(?:has\s+)?(?:successfully\s+)?passed|(?:lecturer|speaker|moderator)(?:\s+and\s+\p{L}+)?\s+at)(?:\s+(?:the|an?)(?![\p{L}]))?(?:\s+international)?(?:\s+(?:course|conference|seminar|workshop|webinar|training|congress|programme|program)(?![\p{L}]))?(?:\s+(?:entitled|titled|on)(?![\p{L}]))?/u,
  /(?<![\p{L}])(?:kursa|konference|seminara|apmaciba|kongresa)(?![\p{L}])/u,
];
/** lines that end a title: who, how many points, which approval, when, where */
const STOP_LINE =
  /^(?:dr\.|prof|asoc|doc\.|lab |lab$|sertifikacijas|nr\.|tip|\d+[.,/:]|\d+\s*(?:tip|punkt|stund|h |ects|cme|credit|val)|lektor|programm|sedes|seminars organiz|ar so|par dalibu|saskana|pamatojoties|izsniegt|noris|datums|laiks|vieta|date|held|venue|place|organi[sz]|apjoms|duration|reg|un noklausij|programa suderint|programme approved|skirt)/u;
/** "Olainfarm organizētajā", "SIA X rīkoto semināru": the event name follows on the next line */
const ORGANISED_BY = /(?:organizet|rikot|rikotaj|organized by|organised by)\p{L}*(?:\s+\p{L}+)?$/u;
const YEAR = /(?:19|20)\d{2}/;

function cleanTitle(s: string): string {
  return collapse(s)
    // OCR often turns „ into » or ,, so strip any quote-like character at both ends
    .replace(/^[\s:„“”"«»‚‘’',|~_•·*-]+|[\s:„“”"«»‚‘’',.;|~_•·*-]+$/gu, "")
    .trim();
}

/** a line that is a date or an amount, not a title; "22ND ESSKA CONGRESS" and "10th Annecy ..." are titles */
const looksLikeDateOrPoints = (s: string) =>
  /^\d+[.,/:-]|^\d+\s*(?:tip|punkt|stund|h(?![\p{L}])|ects|cme|credit|val)|tip(?![\p{L}])|punkt|stund|hours?|points?|credits?|minutes|datums|date/iu.test(fold(s));

/** reads as words, not OCR debris: two or more 3+ letter words, mostly letters */
function wordy(s: string): boolean {
  const words = s.split(/\s+/).filter((w) => /^[\p{L}][\p{L}'’.,:;?!()-]{2,}$/u.test(w));
  const letters = (s.match(/\p{L}/gu) ?? []).length;
  return words.length >= 2 && letters / Math.max(1, s.replace(/\s/g, "").length) >= 0.6;
}

/** Title and how sure we are (0-1) */
export function findTitle(t: Text): { value: string; confidence: number } {
  const { raw } = t;
  // OCR leaves table borders and bullets at line starts ("| ADVANCED KNEE COURSE")
  const lines = t.lines.map((l) => l.replace(/^[|\s:;~_•·*]+/u, ""));
  const folded = lines.map(fold);
  const usable = (i: number) => !!lines[i] && wordy(lines[i]) && !STOP_LINE.test(folded[i]) && !looksLikeDateOrPoints(lines[i]);

  // 1. quoted text, skipping quoted organisation names (SIA „...") and regulation names
  const quoted: { value: string; index: number }[] = [];
  for (const re of QUOTES) {
    for (const m of raw.matchAll(re)) {
      const before = raw.slice(Math.max(0, m.index - 30), m.index);
      const value = cleanTitle(m[1]);
      if (value.length >= 6 && !ORG_PREFIX.test(before) && !NOT_TITLE.test(fold(value)) && !quoted.some((q) => q.index === m.index))
        quoted.push({ value, index: m.index });
    }
  }
  quoted.sort((a, b) => a.index - b.index);
  if (quoted.length) {
    const anchorAt = TITLE_ANCHORS.map((re) => rx(re.source, "u").exec(t.fold)?.index ?? -1).filter((i) => i >= 0);
    const firstAnchor = anchorAt.length ? Math.min(...anchorAt) : -1;
    const pick = quoted.find((q) => firstAnchor >= 0 && q.index > firstAnchor) ?? quoted[0];
    return { value: pick.value, confidence: firstAnchor >= 0 ? 0.85 : 0.7 };
  }

  // 2. rest of the anchor line, or the next line(s)
  for (const re of TITLE_ANCHORS) {
    for (let i = 0; i < lines.length; i++) {
      const m = rx(re.source, "u").exec(folded[i]);
      if (!m) continue;
      const restFolded = folded[i].slice(m.index + m[0].length);
      const rest = cleanTitle(lines[i].slice(m.index + m[0].length));
      const organisedBy = ORGANISED_BY.test(restFolded.trim());
      if (wordy(rest) && !organisedBy && !looksLikeDateOrPoints(rest) && !/^(?:un |and )/u.test(restFolded.trim()))
        return { value: rest, confidence: 0.75 };
      if (usable(i + 1)) {
        // a title often runs over two lines; keep the second unless it is who/points/approval/when
        const next = cleanTitle(lines[i + 1]);
        // a one-word line ("Kardioloģijas") is a title running on; a second full line usually is too, unless it is a place/date
        const second = (usable(i + 2) || (!!lines[i + 2] && /^\p{L}{4,}[?.!]?$/u.test(lines[i + 2]) && !STOP_LINE.test(folded[i + 2])))
          && !YEAR.test(lines[i + 2]) && !/[?.!]$/.test(next);
        return { value: second ? cleanTitle(`${next} ${lines[i + 2]}`) : next, confidence: 0.7 };
      }
    }
  }

  // 3. "The 10th Annecy Live Surgery International Shoulder Advanced Course, Annecy, France"
  for (let i = 0; i < lines.length; i++) {
    const m = /^(?:the\s+)?(\d+(?:st|nd|rd|th)\s+.{6,140}?(?:course|congress|conference|symposium|meeting|workshop|days))(?![\p{L}])/iu.exec(lines[i]);
    if (m) return { value: cleanTitle(m[1]), confidence: 0.6 };
  }

  // 4. "apliecina, ka" / "certify that" <name> <verb> <title>: take the line after the name
  for (let i = 0; i < lines.length; i++) {
    if (/apliecina,?\s+ka|certif\p{L}*\s+that/u.test(folded[i]) && usable(i + 2)) return { value: cleanTitle(lines[i + 2]), confidence: 0.4 };
  }
  return { value: "", confidence: 0 };
}

// ----- organizer -----

const ORG_WORDS =
  /biedrib|asociacij|universitat|universitet|slimnic|centr[sa]|klinik|koledz|akademij|institut|dienests|(?<![\p{L}])(?:sia|vsia|ltd|llc|gmbh|ab)(?![\p{L}])|association|society|university|hospital|clinic|college|academy|institute|centre|center|foundation|federation|olainfarm|servier|viatris|astrazeneca|boehringer|krka|johnson|novartis|pfizer|sanofi|roche|bayer|gedeon|berlin-chemie|medline/u;
const NOT_ORG = /saskanot|apstiprin|akreditet|registr|accredited|approved|endorsed|ar\s+\p{L}+\s+biedrib|sertifikacijas padome|lab sertifik|data collected|public institution/u;
const HEADINGS = /^(?:apliecība|sertifikāts|sertifikats|certificate(?:\s+of\s+\p{L}+)?|diploms|izziņa|attestation|apliecina|this is to certify|apliecinājums)/iu;

export function findOrganizer(t: Text): string {
  const top = t.lines.slice(0, 25);
  const i = top.findIndex((l) => ORG_WORDS.test(fold(l)) && !NOT_ORG.test(fold(l)) && l.length <= 160);
  if (i >= 0) {
    // OCR leaves stray single letters from logos ("U University")
    let org = collapse(top[i].replace(/(?<![\p{L}\p{N}])\p{L}(?![\p{L}\p{N}.])/gu, " "));
    // logos often split the name over two lines: "Klaipeda" / "University"
    const prev = i > 0 ? collapse(top[i - 1]) : "";
    if (org.split(" ").length <= 2 && /^\p{Lu}[\p{L}-]+(?:\s+\p{Lu}[\p{L}-]+)?$/u.test(prev) && !HEADINGS.test(prev)) org = `${prev} ${org}`;
    return org.replace(/\s+(?:rector|dean|director|rektors|dekāns|direktors)\b.*$/iu, "").replace(/[,;:]+$/, "");
  }
  const first = t.lines.find((l) => !HEADINGS.test(l) && l.length >= 3);
  return first ? collapse(first) : "";
}

// ----- approval id -----

const ID = "([A-Z0-9ĀČĒĢĪĶĻŅŠŪŽ][\\p{L}\\p{N}\\-/.]*\\p{N}[\\p{L}\\p{N}\\-/]*)";
const APPROVAL_PATTERNS = [
  rx(`(?:reģ(?:istrācijas)?\\.?\\s*(?:Nr|numurs)\\.?|reģistrēt\\p{L}*[^\\n]{0,60}?Nr\\.?|apstiprināt\\p{L}*[^\\n]{0,60}?Nr\\.?|saskaņot\\p{L}*[^\\n]{0,80}?Nr\\.?|akreditēt\\p{L}*[^\\n]{0,60}?Nr\\.?|dokumentu\\s+Nr\\.?|lēmum\\p{L}*\\s+Nr\\.?)\\s*[:#]?\\s*${ID}`, "iu"),
  rx(`(?:approval|accreditation|registration|event)\\s*(?:no\\.?|number|code|id)\\s*[:#]?\\s*${ID}`, "iu"),
  rx(`(?<![\\p{L}])TIP\\s?((?:19|20)\\d{2}/\\d{2,5})`, "u"),
  rx(`(?<![\\p{L}])(?:Nr\\.?|No\\.)\\s*[:#]?\\s*${ID}`, "u"),
];

export function findApprovalId(t: Text): string | null {
  // the registration line often follows "saskaņots ar ... biedrību," on the next line
  const joined = t.raw.replace(/,\s*\n/g, ", ");
  // OCR puts every word on its own line ("Nr.\nTIP2021/521"): try again on one line
  for (const text of [joined, joined.replace(/\n/g, " ")]) {
    for (const re of APPROVAL_PATTERNS) {
      const m = re.exec(text);
      if (m) return m[1].replace(/[.,/-]+$/, "").slice(0, 100);
    }
  }
  return null;
}
