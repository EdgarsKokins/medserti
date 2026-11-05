import { fold, type Text } from "./text";

/*
 * Every LĀB approval number on a certificate: "TIP2023/6507", "TIP 2023/6507", "Nr. 2020/437", "1,3 TIP 2023/6507",
 * "Sertifikācijas padomes lēmums 2024/6983", "TIP2023/6311; TIP2023/6344", glued "TIP2023/6295apliecina".
 * The number is what the register is asked for (lib/tipRegistry.ts), so a read that is not a real number costs one
 * question and finds nothing; a date or a product code ("10.05.2023", "PC-LV-100949") has no year/number shape at all.
 */

export interface ApprovalRead {
  /** "TIP2023/6507", with the digit fix when OCR printed a letter ("535S" read as 5355) */
  id: string;
  /** TIP printed right before the number ("1,3 TIP 2023/6507"), when it is */
  tip: number | null;
}

/** What a digit can be when OCR printed a letter */
const LETTER_DIGIT: Record<string, string> = { o: "0", s: "5", i: "1", l: "1", b: "8", z: "2" };
/** A letter counts as a digit only at the end or inside the number: "6295apliecina" and "6295Sertifikāts" are 6295 */
const NUMBER = "\\d(?:\\d|[osilbz](?![\\p{L}\\p{N}])|[osilbz](?=\\d)){1,4}";
const APPROVAL = new RegExp(`(?<![\\p{N}]|\\p{N}[.,/-])(tip\\s?)?((?:19|2[0o])\\d{2})\\s?/\\s?(${NUMBER})(?![\\p{N}]|[/.-]\\p{N})`, "gu");
/** "Regula (ES) 2016/679": a law, not an approval */
const LAW = /(?:regul\p{L}*|direktiv\p{L}*|regulation|directive|\((?:es|eu)\))[^\n]{0,40}$/u;
/** The value in "1,3 TIP" or "1,3TIP" right before the number, with at most a line of words between */
const TIP_BEFORE = /(\d{1,2}[.,;]\d{1,2}|\d{1,2})\s*tip(?:\s+sertifikacijas\s+padomes\s+lemums\s*:?|\s+tip)?$/u;

const normalize = (year: string, number: string) =>
  `TIP${year.replace(/o/g, "0")}/${number.replace(/[osilbz]/g, (c) => LETTER_DIGIT[c])}`;

/** The canonical form of a number in folded text ("tip2022/535s" is "TIP2022/5355"), or null */
export function canonicalApproval(s: string): string | null {
  const m = [...fold(s).matchAll(APPROVAL)][0];
  return m ? normalize(m[2], m[3]) : null;
}

/** All approval numbers of a certificate, each once, in the order they are printed. Runs on a text layer and OCR read together. */
export function findApprovalNumbers(t: Text): ApprovalRead[] {
  const out = new Map<string, ApprovalRead>();
  for (const m of t.flat.matchAll(APPROVAL)) {
    const [, tip, year, number] = m;
    const before = t.flat.slice(Math.max(0, m.index - 80), m.index);
    if (LAW.test(before)) continue;
    // "LV2024/100001": someone else's code; a word glued on ("lēmums2024/6983") is small letters
    if (!tip && /\p{Lu}/u.test(t.raw[m.index - 1] ?? "")) continue;
    // "2023/2024", "2023/24": a school year, unless it says TIP
    const next = (Number(year.replace(/o/g, "0")) + 1) % 10_000;
    if (!tip && (number === String(next) || number === String(next % 100).padStart(2, "0"))) continue;
    if (!tip && number.length < 3) continue;
    // "1,3 TIP TIP2023/5987": the label of a value, then the number
    const printed = TIP_BEFORE.exec(`${before}${tip ?? ""}`.trimEnd());
    const id = normalize(year, number);
    const value = printed ? Number(printed[1].replace(/[,;]/, ".")) : null;
    const seen = out.get(id);
    if (!seen) out.set(id, { id, tip: value });
    else if (seen.tip == null) seen.tip = value;
  }
  return [...out.values()];
}
