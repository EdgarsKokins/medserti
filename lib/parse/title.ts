import { collapse, despace, fold, rx, sealLines, type Text } from "./text";

// ----- title -----

const QUOTES = [
  /„([^“”"\n]{0,200}(?:\n[^“”"\n]{0,200}){0,2})[“”"]/gu,
  /«([^»]{4,300})»/gu,
  /“([^”]{4,300})”/gu,
  /"([^"]{4,300})"/gu,
  // OCR turns typographic quotes into two apostrophes: ''Karpālais kanāls''
  /(?:''|’’|‘‘)([^'\n]{4,200}(?:\n[^'\n]{1,200}){0,2})(?:''|’’|“|”)/gu,
];
const ORG_PREFIX = /(?<![\p{L}])(?:SIA|AS|VSIA|NRC|biedrība|nodibinājums|Ltd|LLC|GmbH|Inc|institution|iestāde|ООО|ОАО|ЗАО|АО|клиник\p{L}*|больниц\p{L}*|центр\p{L}*|университет\p{L}*|институт\p{L}*)\.?\s*$/iu;
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
  return stripOcrNoise(s)
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

/** "провел 4 (четыре) мастер-класс-операции", "performed 3 master class operations": the activity is the title */
const MASTER_CLASS = [
  /провел\p{L}*\s+(\d{1,2})\s*(?:\(\p{L}+\)\s*)?(мастер-класс[\p{L}-]*)/u,
  /(?:performed|conducted|gave|held)\s+(\d{1,2})\s+(master[- ]class\p{L}*(?:\s+(?:operations?|surger\p{L}+))?)/u,
];

/** Title and how sure we are (0-1) */
export function findTitle(t: Text): { value: string; confidence: number } {
  const { raw } = t;
  // OCR leaves table borders and bullets at line starts ("| ADVANCED KNEE COURSE")
  const lines = t.lines.map((l) => l.replace(/^[|\s:;~_•·*]+/u, ""));
  const folded = lines.map(fold);
  const usable = (i: number) => !!lines[i] && wordy(lines[i]) && !STOP_LINE.test(folded[i]) && !looksLikeDateOrPoints(lines[i]);

  // 0. a letter confirming master classes names no event (its quotes hold the clinic): the activity and count are the title
  for (const re of MASTER_CLASS) {
    const m = re.exec(t.flat);
    if (m) {
      const from = m.index + m[0].lastIndexOf(m[2]);
      const what = t.raw.slice(from, from + m[2].length);
      return { value: `${what.charAt(0).toUpperCase()}${what.slice(1)} (${m[1]})`, confidence: 0.6 };
    }
  }

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
    return { value: pick.value, confidence: firstAnchor >= 0 ? 0.9 : 0.7 };
  }

  // 2. rest of the anchor line, or the next line(s)
  for (const re of TITLE_ANCHORS) {
    for (let i = 0; i < lines.length; i++) {
      const m = rx(re.source, "u").exec(folded[i]);
      if (!m) continue;
      const restFolded = folded[i].slice(m.index + m[0].length);
      // "Par dalību seminārā tiek piešķirti TIP punkti": a points line, the title is not after it
      if (/(?<![\p{L}])tip(?![\p{L}])|punkt|kredit/u.test(restFolded)) continue;
      const rest = cleanTitle(lines[i].slice(m.index + m[0].length));
      const organisedBy = ORGANISED_BY.test(restFolded.trim());
      if (wordy(rest) && !organisedBy && !looksLikeDateOrPoints(rest) && !/^(?:un |and )/u.test(restFolded.trim()))
        return { value: rest, confidence: 0.8 };
      if (usable(i + 1)) {
        // a title often runs over two lines; keep the second unless it is who/points/approval/when
        const next = cleanTitle(lines[i + 1]);
        // a one-word line ("Kardioloģijas") is a title running on; a second full line usually is too, unless it is a place/date
        const second = (usable(i + 2) || (!!lines[i + 2] && /^\p{L}{4,}[?.!]?$/u.test(lines[i + 2]) && !STOP_LINE.test(folded[i + 2])))
          && !YEAR.test(lines[i + 2]) && !/[?.!]$/.test(next);
        // one clean line right after "participated in" is the surest unquoted title; a joined second line less so
        return { value: second ? cleanTitle(`${next} ${lines[i + 2]}`) : next, confidence: second ? 0.75 : 0.9 };
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
/** institution words added for header-only organizers ("BALTIC DEMO CARDIOLOGY FORUM", "Jēkabpils novada pašvaldība"); a name found only by these is less sure */
const MORE_ORG_WORDS = /(?<![\p{L}])(?:forum\p{L}*|pasvaldib\p{L}*|nodibinajum\p{L}*|ооо|ао|клиник\p{L}*|больниц\p{L}*|центр\p{L}*|университет\p{L}*|институт\p{L}*|академи\p{L}*|обществ\p{L}*|ассоциаци\p{L}*|форум\p{L}*)(?![\p{L}])/u;
/** an event, not an institution: a header naming one is the event's name */
const EVENT_WORDS = /kongres|konferenc|seminar|simpozij|kurs|congress|conference|symposium|course|meeting|конгресс|конференц|семинар/u;
const NOT_ORG = /saskanot|apstiprin|akreditet|registr|accredited|approved|endorsed|ar\s+\p{L}+\s+biedrib|sertifikacijas padome|lab sertifik|data collected|public institution/u;
const HEADINGS = /^(?:apliecība|sertifikāts|sertifikats|certificate(?:\s+of\s+\p{L}+)?|diploms|izziņa|attestation|apliecina|this is to certify|apliecinājums)/iu;

/** "Seminārs organizēts ar SERVIER atbalstu", "Semināra atbalstītājs KRKA", "supported by X": a sponsor, not the organizer */
const SPONSOR = /atbalst|with the support of|supported by|sponsored by|unrestricted (?:educational )?grant/u;
/** a line naming a speaker or the speaker's workplace ("Dr. Anna Mihailova, AM konsultācijas SIA") */
const SPEAKER = /^(?:dr|prof|asoc|doc|docente|profesor\p{L}*)(?![\p{L}])\.?|(?<![\p{L}])(?:dr|prof)\.\s+\p{Lu}/u;
/** "Olainfarm organizētajā", "SIA „Jēkabpils Reģionālās slimnīcas” organizētajā konferencē", "X rīkoto semināru" */
const ORGANIZED_BY_LINE = /(.{3,120}?)\s+(?:organizet|rikot|apvienot)\p{L}*/u;
/** "Semināru organizē Viatris SIA", "organized by Department of ...", "piedalījās <X> sēdē" */
const ORGANIZER_AFTER = /(?:organize|organi[sz]ed by|organi[sz]ators?:?|organi[sz]ers?:?|организатор\p{L}*:?)\s+(.{3,100})$/u;
const MEETING_OF = /piedal\p{L}*\s+(.{5,100}?)\s+(?:sede|sedi|sapulce)(?![\p{L}])/u;
/** text before the organizer's name on its line: dates, "piedalījās", "ir apmeklējis/usi", "participated in" */
const LEAD_IN = /^(?:.*?(?:\d{4}\.?|piedal[iī1]j\p{L}*|apmeklēj\p{L}*(?:\/-?\p{L}+)?|apmeklej\p{L}*(?:\/-?\p{L}+)?|noklausīj\p{L}*|par dalību|par dalibu|participated in|attended)\s*)+/iu;
/** OCR keeps two-letter scraps of logos ("4 University", "rr University Ee"); these may stay */
const SHORT_OK = new Set(["sia", "as", "ab", "vsia", "of", "un", "ar", "and", "the", "for", "de", "la", "rsu", "lu"]);
/** signature block roles: the line names who signed, not who organized */
const SIGNATORY = /rektor|rector|dekan|dean|prezident|president|valdes|director|direktor|vaditaj|chair/u;
const GENERIC_ORG =
  /^(?:university|universit\p{L}*|hospital|slimnic\p{L}*|clinic|klinik\p{L}*|centrs|center|centre|asociacij\p{L}*|biedrib\p{L}*|akademij\p{L}*|academy|institut\p{L}*|koledz\p{L}*|college|society|association|foundation|forum|pasvaldib\p{L}*)$/u;
/** a label or article left in front of the name: "Organiser: X", "Organised by the X", "Организатор: X" */
const ORG_LABEL = /^(?:(?:organi[sz](?:ators?|ers?|ed\s+by)|организатор\p{L}*)\s*:?\s*)?(?:the\s+)?/iu;
/** short words kept in capitals when a name printed in capitals is shown in normal case ("SIA", "RSU", "AED") */
const SMALL_WORDS = new Set(["of", "and", "the", "for", "in", "on", "un", "ar", "de", "la", "и", "для"]);

/**
 * A name printed in capitals, in normal case for display: "SIA PARAUGU MEDICĪNAS AKADĒMIJA" -> "SIA Paraugu Medicīnas Akadēmija".
 * Words of three letters or fewer stay as printed (legal forms, abbreviations), except "of", "and", "un".
 * Names with any lowercase letter are left alone.
 */
export function displayCase(name: string): string {
  if (/\p{Ll}/u.test(name) || !/\p{Lu}{4}/u.test(name)) return name;
  return name
    .split(" ")
    .map((w, i) => {
      const core = w.replace(/[^\p{L}]/gu, "");
      if (i > 0 && SMALL_WORDS.has(core.toLowerCase())) return w.toLowerCase();
      if (core.length <= 3) return w;
      return w.toLowerCase().replace(/(^|[^\p{L}])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase());
    })
    .join(" ");
}

/** OCR debris out of a name or title: runs of punctuation, stray symbols ("---::::", ".~", "|") */
export function stripOcrNoise(s: string): string {
  return collapse(
    s
      .replace(/[~|_•·*=<>^`¦§]+/gu, " ")
      .replace(/[-:;.,'"]{2,}/gu, " ")
      .replace(/(^|\s)[^\p{L}\p{N}\s(]+(?=\s|$)/gu, " "),
  ).replace(/^[\s,.;:-]+|[\s,;:-]+$/gu, "");
}

/** reads as a name, not OCR debris: mostly letters, a real word, no "biedrTba"/"KLlNIK" case flips inside words */
function cleanName(s: string): boolean {
  const letters = (s.match(/\p{L}/gu) ?? []).length;
  const chars = s.replace(/\s/g, "").length;
  return chars >= 3 && letters / chars >= 0.75 && /\p{L}{3,}/u.test(s);
}
const caseFlip = (s: string) => /\p{Ll}\p{Lu}\p{Ll}|\p{Lu}\p{Ll}\p{Lu}(?!\p{Ll})/u.test(s.replace(/(?<![\p{L}])(?:SIA|AS|AB|McG\p{L}*)(?![\p{L}])/gu, ""));

/**
 * Organizer and how sure we are (0-1). Empty with confidence 0 rather than a sponsor line or OCR junk.
 * `stated` is true when the certificate's sentence names the organizer ("issued by", "organizētajā", "sēdē").
 */
export function findOrganizer(t: Text): { value: string; confidence: number; stated: boolean; header?: boolean } {
  const top = t.lines.slice(0, 30);
  const folded = top.map(fold);
  const out = (value: string, confidence: number) => {
    // a zero read for a capital O ("0lainfarm"); logo scraps and digits dropped
    const tokens = stripOcrNoise(stripOcrNoise(value).replace(ORG_LABEL, "")).replace(/(?<![\p{L}\p{N}])0(?=\p{Ll})/gu, "O").split(" ");
    const kept = tokens.filter((w) => !/^\d+$/.test(w) && !(w.replace(/[^\p{L}]/gu, "").length <= 2 && !SHORT_OK.has(fold(w).replace(/[^a-z]/g, "")) && !/[&]/.test(w)));
    if (kept.length <= 1 && GENERIC_ORG.test(fold(kept[0] ?? ""))) return null; // "University" alone says nothing
    if (kept.length > 12) return null; // a sentence, not a name
    if (kept.length > 8 && kept.filter((w) => /^\p{Ll}{3,}$/u.test(w)).length >= 4) return null;
    const v = kept.join(" ").replace(/\s+(?:rector|dean|director|rektors|dekāns|direktors)\b.*$/iu, "").trim();
    if (!cleanName(v)) return null;
    return { value: displayCase(v).slice(0, 200), confidence: caseFlip(v) ? Math.min(confidence, 0.5) : confidence, stated: false };
  };
  const stated = (r: ReturnType<typeof out>) => (r ? { ...r, stated: true } : null);

  // 1. "The certificate was issued by SIA “Med4U”, Reg. No. ...": the organizer is what follows "issued by"
  for (const l of top) {
    const m = /(?:issued by|izsniedza|izsniedzējs:?)\s+(.+?)(?:,|\.?$)/iu.exec(l);
    const r = stated(m && out(m[1].replace(/[“”"„]/g, ""), 0.9));
    if (r) return r;
  }

  // 1b. Russian letters: "в Университетской клинике «AKFA Medline»", "ООО «AKFA MEDLINE»" (OCR may leave a stray "i" before the quote)
  {
    const named = [...t.raw.matchAll(/(?<![\p{L}])(?:клиник\p{L}*|больниц\p{L}*|центр\p{L}*|институт\p{L}*|университет\p{L}*|ООО|ОАО|ЗАО)(?:\s+[^\s«"„“]{1,2})?\s+[«"„“]\s*([^»"”\n]{2,80}?)\s*[»"”]/giu)]
      .map((m) => m[1].replace(/[.,;:]+(?=\s|$)/g, "").replace(/\s+/g, " ").trim())
      .filter((v) => cleanName(v));
    // OCR mixes scripts in a Latin name ("АКЕА Medline"); a name in one script is the clean read
    const mixed = (v: string) => /[A-Za-z]/.test(v) && /[\u0400-\u04FF]/.test(v);
    const pick = named.find((v) => !mixed(v)) ?? named[0];
    const r = pick ? stated(out(pick, mixed(pick) ? 0.6 : 0.8)) : null;
    if (r) return r;
  }

  // 2. the sentence names the organizer: "<X> organizētajā ...", "Semināru organizē <X>", "piedalījās <X> sēdē"
  //    (scanner text layers break "piedalījās <X> sēdē" over lines, so look in the joined text too)
  {
    const m = MEETING_OF.exec(t.flat);
    if (m && !SPONSOR.test(m[0])) {
      const from = m.index + m[0].indexOf(m[1]);
      const r = stated(out(t.raw.slice(from, from + m[1].length), 0.8));
      if (r) return r;
    }
  }
  for (let i = 0; i < top.length; i++) {
    if (SPONSOR.test(folded[i])) continue;
    const after = ORGANIZER_AFTER.exec(folded[i]);
    if (after) {
      const r = stated(out(top[i].slice(after.index + after[0].length - after[1].length), 0.8));
      if (r) return r;
    }
    const meeting = MEETING_OF.exec(folded[i]);
    if (meeting) {
      const from = meeting.index + meeting[0].indexOf(meeting[1]);
      const r = stated(out(top[i].slice(from, from + meeting[1].length), 0.8));
      if (r) return r;
    }
    const m = ORGANIZED_BY_LINE.exec(folded[i]);
    if (!m || /seminar\p{L}*\s*$/u.test(m[1])) continue;
    const before = top[i].slice(0, m[1].length).replace(LEAD_IN, "");
    const r = before.split(/\s+/).length <= 12 ? stated(out(before, 0.8)) : null;
    if (r) return r;
  }

  // 3. the first line naming an institution, skipping sponsor lines, approvals, speakers' workplaces and seal text
  const seal = sealLines(top);
  // the header: lines above "SERTIFIKĀTS" / "apliecina, ka" / "This is to certify", at most the first three
  const headingAt = top.findIndex((l, i) => HEADINGS.test(l) || /apliecin|certif|ar so /u.test(folded[i]));
  const headerEnd = Math.min(3, headingAt < 0 ? 3 : headingAt);
  // words of the document, to split a letter-spaced header ("S I A PA R A U G U ...") back into words
  const vocab = new Set([...t.fold.matchAll(/\p{L}{3,}/gu)].map((m) => m[0]).concat(["as", "ab"]));
  for (let i = 0; i < top.length; i++) {
    if (seal.has(i)) continue;
    const spaced = i < headerEnd ? despace(top[i], vocab) : null;
    const line = spaced ?? top[i];
    const f = spaced ? fold(spaced) : folded[i];
    const more = !ORG_WORDS.test(f) && MORE_ORG_WORDS.test(f);
    if (!(ORG_WORDS.test(f) || more) || NOT_ORG.test(f) || SPONSOR.test(f) || line.length > 160) continue;
    // a sentence ("Through an agreement between the Union ... and the American Medical Association") is not a name
    if (line.split(/\s+/).length > 10 && /\p{Ll}{4,}\s+\p{Ll}{4,}\s+\p{Ll}{4,}/u.test(line)) continue;
    if (SPEAKER.test(f) || (i > 0 && SPEAKER.test(folded[i - 1])) || SIGNATORY.test(f)) continue;
    let org = collapse(line.replace(/(?<![\p{L}\p{N}])\p{L}(?![\p{L}\p{N}.])/gu, " ")); // stray logo letters ("U University")
    // logos often split the name over two lines: "Klaipeda" / "University"
    const prev = i > 0 && !seal.has(i - 1) ? collapse(top[i - 1]) : "";
    let joined = false;
    if (org.split(" ").length <= 2 && /^\p{Lu}[\p{L}-]+(?:\s+\p{Lu}[\p{L}-]+)?$/u.test(prev) && !HEADINGS.test(prev)) {
      org = `${prev} ${org}`;
      joined = true;
    }
    // "Tartu University Hospital, Estonia." is where it took place, not necessarily who organized it
    const venue = /,\s*\p{L}+\.?$/u.test(collapse(line));
    const clean = org.length <= 80 && !/\d{3}/.test(org) && !joined && !venue && org === stripOcrNoise(org);
    // a name only the added words, a letter-spaced line or the header rule found is less sure than the old rule
    const header = i < headerEnd && !joined && !EVENT_WORDS.test(f);
    const r = out(org, clean ? (more || spaced ? 0.8 : 0.9) : 0.7);
    if (r) return header ? { ...r, header: true } : r;
  }

  // 4. nothing names the organizer (a sponsor line alone does not): leave it for the user
  return { value: "", confidence: 0, stated: false };
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
