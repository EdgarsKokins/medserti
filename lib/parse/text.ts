/*
 * Text preparation shared by every extractor.
 *
 * Certificates reach us in three shapes: a clean PDF text layer, the OCR layer a scanner app (Adobe Scan)
 * put into the PDF, or our own tesseract OCR. The last two drop diacritics ("SEPTEMBRT" for "SEPTEMBRĪ"),
 * split words onto separate lines and break decimals ("apliecina2.\n7 TIP").
 *
 * So every extractor matches on `fold` (lowercase, no diacritics, common OCR slips fixed) or `flat`
 * (fold with line breaks as spaces), and slices values out of `raw`. All three have the same length,
 * so an index found in one is valid in the others.
 */

export interface Text {
  /** prepared original text, used for values shown to the user */
  raw: string;
  /** same length as raw: lowercase, diacritics stripped, OCR slips mapped */
  fold: string;
  /** fold with line breaks as spaces, for patterns OCR split over several lines */
  flat: string;
  /** trimmed non-empty lines of raw */
  lines: string[];
}

export function prepare(s: string): string {
  return s
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/[   \t]/g, " ")
    .replace(/[‐-―−]/g, "-")
    .replace(/ {2,}/g, " ");
}

/** One UTF-16 unit in, one out, so indexes stay aligned with raw */
function foldUnit(c: string): string {
  const code = c.charCodeAt(0);
  if (code >= 0xd800 && code <= 0xdfff) return "?"; // half of an emoji or other astral character
  return (c.normalize("NFKD")[0] ?? c).toLowerCase()[0] ?? c;
}

export function fold(raw: string): string {
  const out = Array.from({ length: raw.length }, (_, i) => foldUnit(raw[i]));
  // Adobe Scan reads "ī" as "T" inside lowercase words ("kredTtpunktu", "lipTdus")
  for (const m of raw.matchAll(/(?<=\p{Ll})T(?=\p{Ll})/gu)) out[m.index] = "i";
  return out.join("");
}

export function makeText(input: string): Text {
  const raw = prepare(input);
  const f = fold(raw);
  return { raw, fold: f, flat: f.replace(/\n/g, " "), lines: raw.split("\n").map((l) => l.trim()).filter(Boolean) };
}

// JS \b is ASCII-only; these lookarounds work with Latvian letters
export const NB = "(?<![\\p{L}\\p{N}])"; // no letter/digit before
export const NA = "(?![\\p{L}\\p{N}])"; // no letter/digit after
export const rx = (src: string, flags = "giu") => new RegExp(src, flags);

export const toNum = (s: string) => Number(s.replace(/\s/g, "").replace(",", "."));
export const collapse = (s: string) => s.replace(/\s+/g, " ").trim();

export function lineAt(text: string, index: number): string {
  const start = text.lastIndexOf("\n", index) + 1;
  const end = text.indexOf("\n", index);
  return text.slice(start, end === -1 ? undefined : end);
}

/** `before` characters before and `after` characters after a match, in flat (folded, one line) text */
export function around(t: Text, index: number, length: number, before = 60, after = 40): { pre: string; post: string } {
  return { pre: t.flat.slice(Math.max(0, index - before), index), post: t.flat.slice(index + length, index + length + after) };
}

/** Does the text read as Latvian, even with diacritics lost? */
export function looksLatvian(t: Text): boolean {
  // several Latvian letters, not one stray "ļ" in OCR noise
  if ((t.raw.match(/[āčēģīķļņšūž]/gi) ?? []).length >= 3) return true;
  return /sertifikats|apliecin|piedalij|talakizglitib|kreditpunkt|arstu|seminara|konferenc[eē]|gada \d/.test(t.flat);
}

// ----- seals and stamps -----

/** a legal form: a line carrying one is a name, never a seal fragment */
const LEGAL_FORM =
  /(?<![\p{L}])(?:SIA|AS|VSIA|AB|UAB|OÜ|LLC|LTD|GMBH|INC|BIEDRĪBA|BIEDRIBA|NODIBINĀJUMS|NODIBINAJUMS|ООО|ОАО|ЗАО|АО)(?![\p{L}])/u;
/** words a points line needs ("8\nTIP", "12\nCREDITS", "KOPĀ"), and certificate headings, are never seal text (folded) */
const NOT_SEAL =
  /(?<![\p{L}])(?:tip|cme|ects|ecmec|cpd|lab)(?![\p{L}])|credit|point|punkt|kredit|stund|hour|kopa|total|sertifik|apliecib|certific|diplom|izzin|attestation|балл|кредит|час|сертификат|удостоверени/u;

/** one to three words, all capitals, no digits: "PARAUGU", "MED.", "PALĪDZĪBAS CENTRS", OCR's "—- PARAUGU" */
function shortCaps(line: string): boolean {
  const s = line.replace(/^[^\p{L}]+|[^\p{L}.]+$/gu, "");
  const words = s.split(/\s+/).filter(Boolean);
  return words.length >= 1 && words.length <= 3 && /\p{Lu}{2}/u.test(s) && !/[\p{Ll}\p{N}]/u.test(s)
    && !LEGAL_FORM.test(s) && !NOT_SEAL.test(fold(s)) && words.every((w) => /^[\p{Lu}][\p{Lu}.'’-]*$/u.test(w));
}

/**
 * Lines that are the text of a round seal or stamp: a run of short all-capital fragments broken over lines
 * ("PARAUGU" / "MED." / "AKADĒMIJA"). Three or more in a row, or two with an abbreviation ("NEATL."), and no legal form.
 * `any` takes every such fragment, even alone: for extractors that never read names (points).
 * Returns their indexes in `lines`; blank lines do not break a run.
 */
export function sealLines(lines: string[], any = false): Set<number> {
  const out = new Set<number>();
  let run: number[] = [];
  const close = () => {
    const abbrev = run.some((i) => /(?<![\p{L}])\p{Lu}{2,5}\.(?:\s|$)/u.test(lines[i].trim()));
    if (any || run.length >= 3 || (run.length === 2 && abbrev)) run.forEach((i) => out.add(i));
    run = [];
  };
  lines.forEach((l, i) => {
    if (!l.trim()) return;
    if (shortCaps(l)) run.push(i);
    else close();
  });
  close();
  return out;
}

/**
 * The text without seal fragments, for the points: "Piešķirti 8" / "AKADĒMIJA" / "PARAUGU" / "TIP" reads as "8 TIP".
 * Every short all-capital line goes (no points label, heading or digit is ever one). A text layer can glue the seal
 * onto the line before it ("8 TIPPARAUGU"): that is split first. Returns `t` itself when there is nothing to remove.
 */
export function withoutSeals(t: Text): Text {
  const raw = t.raw.replace(/(\d\s*(?:TIP|CME|ECTS))(?=\p{Lu}{3,})/gu, "$1\n");
  const lines = raw.split("\n");
  const seal = sealLines(lines, true);
  if (raw === t.raw && !seal.size) return t;
  return makeText(lines.filter((_, i) => !seal.has(i)).join("\n"));
}

/**
 * A letter-spaced line ("S I A PA R A U G U  M E D I C Ī N A S") back into words, or null.
 * The spaces between words are lost, so the letters are split into words that appear elsewhere in the document
 * (`vocab`, folded); a line that does not split completely is not guessed at.
 */
export function despace(line: string, vocab: Set<string>): string | null {
  const tokens = line.trim().split(/\s+/);
  if (tokens.length < 6 || tokens.filter((w) => w.length <= 2).length / tokens.length < 0.75) return null;
  const letters = tokens.join("");
  const f = fold(letters);
  // fewest words that cover every letter
  const best: (number[] | null)[] = Array(f.length + 1).fill(null);
  best[0] = [];
  for (let i = 0; i < f.length; i++) {
    if (!best[i]) continue;
    for (let j = i + 2; j <= Math.min(f.length, i + 30); j++) {
      if (!vocab.has(f.slice(i, j))) continue;
      const cand = [...best[i]!, j];
      if (!best[j] || cand.length < best[j]!.length) best[j] = cand;
    }
  }
  const cuts = best[f.length];
  if (!cuts) return null;
  let from = 0;
  return cuts.map((to) => letters.slice(from, (from = to))).join(" ");
}
