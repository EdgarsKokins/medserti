import { fold } from "./text";

/* Does a certificate belong to the user's specialty? Matches the specialty name, its word stems and their LV/EN counterparts. */

const STOP = new Set([
  "medicine", "medical", "medicīna", "medicīnas", "ārsts", "ārsti", "doctor", "general", "specialist", "speciālists", "and", "un", "of", "the", "care",
  // words in LĀB list names that say nothing about the field
  "bērnu", "metode", "metodes", "terapeits", "terapija", "diagnostika", "eksperts", "prakses", "vispārējās", "skaitā",
]);
/** English specialty word stem -> Latvian stems, for older profiles typed in English and certificates usually in Latvian */
const LV_STEMS: Record<string, string[]> = {
  famil: ["ģimen"],
  cardi: ["kardio"],
  paedi: ["pediat"],
  pedia: ["pediat"],
  surge: ["ķirur"],
  neuro: ["neiro"],
  oncol: ["onkol"],
  derma: ["derma"],
  psych: ["psihi"],
  gynae: ["ginek"],
  gynec: ["ginek"],
  obste: ["dzemd"],
  ophth: ["oftal", "acu "],
  ortho: ["ortop", "traumat", "arthro", "artro", "endoprotez", "locītav"],
  ortop: ["orthop", "traumat", "arthro", "artro", "endoprotez", "locītav"],
  traum: ["ortop", "orthop", "arthro", "artro", "locītav"],
  radio: ["radio"],
  anaes: ["aneste"],
  anest: ["aneste"],
  inter: ["iekšķīg", "internā"],
  emerg: ["neatliek"],
  denti: ["zobārst", "stomat"],
  nursi: ["māsu", "māsa"],
  urolo: ["urolo"],
  endoc: ["endokr"],
  gastr: ["gastro"],
  pulmo: ["pneimo", "pulmo"],
  rheum: ["reimat"],
  infec: ["infekc"],
  otorh: ["otorin"],
  physi: ["fizik", "rehabil"],
  rehab: ["rehabil"],
  occup: ["arodslim"],
  patho: ["patolo"],
  labor: ["laborat"],
};

/** Latvian stem -> English stems, so a Latvian specialty name (LĀB list) also matches English certificates */
const EN_STEMS: Record<string, string[]> = {};
for (const [en, lvs] of Object.entries(LV_STEMS))
  for (const lv of lvs) (EN_STEMS[lv.slice(0, 5)] ??= []).push(en);

export function matchesSpecialty(text: string, specialty: string): boolean {
  // OCR'd text often lost its diacritics, so also look in a folded copy with folded stems
  const lower = text.toLowerCase();
  const folded = fold(text);
  const has = (s: string) => lower.includes(s) || folded.includes(fold(s));
  if (specialty.trim().length >= 4 && has(specialty.trim().toLowerCase())) return true;
  const words = specialty
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .filter((w) => w.length >= 4 && !STOP.has(w));
  return words.some((w) => {
    const stem = w.slice(0, 5);
    return has(stem) || [...(LV_STEMS[stem] ?? []), ...(EN_STEMS[stem] ?? [])].some(has);
  });
}
