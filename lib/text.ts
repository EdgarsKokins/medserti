/* Text folding for search and matching. Client-safe. */

/** Compatibility-decomposed, combining diacritics (U+0300-U+036F) removed, case kept: "Ēriks" -> "Eriks", "ﬁ" -> "fi" */
export const stripMarks = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "");

/** stripMarks() and lowercase: "Rīga" -> "riga", "Йод" -> "иод" */
export const fold = (s: string) => stripMarks(s).toLowerCase();

/** fold(), then each run of anything but letters and digits as one space: "Latvijas Ārstu biedrība (LĀB)" -> "latvijas arstu biedriba lab" */
export const foldKey = (s: string) => fold(s).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
