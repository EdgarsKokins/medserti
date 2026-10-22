import { RULES } from "../rule-constants";
import { formatNumber } from "../format";

/* Helpers the three dictionaries share. */

/** English: 1 day / 2 days */
export const enPl = (n: number, one: string, many: string) => (n === 1 ? one : many);
/** Latvian: numbers ending in 1 (but not 11) take the singular: 1, 21, 101 diena; 2, 11, 12 dienas */
export const lvPl = (n: number, one: string, many: string) => (Math.abs(n) % 10 === 1 && Math.abs(n) % 100 !== 11 ? one : many);

/** Values carried by a parser note (lib/parse.ts) */
export type NoteP = Record<string, string | number | boolean>;
export const fmtN = (v: unknown) => (typeof v === "number" ? formatNumber(v) : String(v ?? ""));
/** "1.3 + 1.3" as the parser stored it: a decimal point in every language, like the rest of the UI */
export const fmtList = (v: unknown) => String(v ?? "");
/** "date,points" -> field names in the UI language */
export const fieldList = (v: unknown, names: Record<string, string>) => String(v ?? "").split(",").filter(Boolean).map((f) => names[f] ?? f).join(", ");

export const specialtyPct = RULES.specialtyShare * 100;
export const capPct = RULES.practicalCapShare * 100;
