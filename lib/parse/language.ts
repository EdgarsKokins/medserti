import { looksLatvian, type Text } from "./text";

/*
 * The language a certificate is written in, for the "LĀB may ask for a certified Latvian translation" warning.
 * Reg. 391 point 47 asks a certified translation for resertification documents not in Latvian; English
 * certificates are routinely accepted, so only documents with neither Latvian nor English get the warning.
 * Bilingual certificates (Lithuanian + English) count as English.
 */

/** ISO 639-1 code, or null when we cannot tell */
export type DocLanguage = "lv" | "en" | "ru" | "uk" | "lt" | "et" | "de" | "pl" | "fr" | "it" | "cs" | null;

const ENGLISH = /(?<![\p{L}])(?:the|of|and|has|this|that|certificate|certify|attended|participated|completed|hours|course|conference|congress|for|in|is|was|awarded)(?![\p{L}])/gu;
const MARKERS: [Exclude<DocLanguage, null>, RegExp][] = [
  ["lt", /pazymejim|dalyvav|valand|kvalifikacij\p{L}* tobulinim|lietuvos/u],
  ["et", /tunnistus|osales|koolitus|tundi|kinnitab/u],
  ["de", /teilnahme|bescheinigung|hat an|fortbildung|stunden/u],
  ["pl", /zaswiadczeni|uczestnictw|godzin/u],
  ["fr", /attestation de|participation|a participe|heures/u],
  ["it", /attestato|partecipazione|ha partecipato|ore formative/u],
  ["cs", /osvedceni|ucast|absolvoval/u],
];

export function docLanguage(t: Text): DocLanguage {
  const letters = (t.raw.match(/\p{L}/gu) ?? []).length;
  const cyrillic = (t.raw.match(/[Ѐ-ӿ]/g) ?? []).length;
  if (letters >= 40 && cyrillic / letters > 0.3) return /[іїєґ]/i.test(t.raw) ? "uk" : "ru";
  if (looksLatvian(t)) return "lv";
  if ((t.flat.match(ENGLISH) ?? []).length >= 4) return "en";
  for (const [lang, re] of MARKERS) if (re.test(t.flat)) return lang;
  return null;
}

/** LĀB may ask for a certified Latvian translation of this document */
export const needsTranslation = (lang: string | null | undefined) => !!lang && lang !== "lv" && lang !== "en";
