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
