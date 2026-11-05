import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fold } from "./text";
import LEXICON from "./lvLexicon.json";

/*
 * The Latvian hunspell dictionary (npm dictionary-lv, LGPL-2.1, files read as shipped), looked up on demand.
 * nspell crashes on it and expanding every form would take hundreds of megabytes, so a word is taken apart instead:
 * its skeleton (below) finds the stems and suffix rules that could have made it, and those give the real forms.
 * Two suffix levels count: lietot + "šana" + "s" is how "lietošanas" exists.
 * Loaded once per process, on the first Latvian certificate. Files ship with outputFileTracingIncludes in next.config.ts.
 */

interface Head {
  word: string;
  flags: string;
  proper: boolean;
}
interface Rule {
  flag: string;
  strip: string;
  add: string;
  /** flags of the rules that may follow this one */
  next: string;
  cond: RegExp | null;
}
interface Dictionary {
  heads: Map<string, Head[]>;
  /** every suffix rule, by the skeleton of what it adds */
  rules: Map<string, Rule[]>;
  /** the rules another rule may follow, by the skeleton of what they add */
  firstOfTwo: Map<string, Rule[]>;
  /** flags that follow another rule */
  second: Set<string>;
}

/** Needs another affix: not a word alone ("aizrāpt") */
const NEEDS_AFFIX = "{";
/** Only with the prefix "jā" or "vis" */
const CIRCUMFIX = "|";
/** The prefixes: "ne" asks the stem for its flag, "jā" and "vis" ask the suffix rule */
const PREFIXES = [
  { add: "ne", flag: "-" },
  { add: "jā", flag: "]" },
  { add: "vis", flag: "[" },
];

const lower = (s: string) => s.normalize("NFC").toLocaleLowerCase("lv");

/**
 * A word with everything OCR confuses taken out, one letter for one letter, so a misread word has the skeleton of the
 * real one: no diacritics (with Adobe's "T" for "ī"), l and 1 as i, o as a (Adobe reads "ārstu" as "orstu"), 0 as u.
 */
export function skeleton(word: string): string {
  return fold(word).replace(/[l1]/g, "i").replace(/o/g, "a").replace(/0/g, "u");
}

/**
 * A T in a word printed in capitals may be "T" or Adobe's "Ī" ("SLIMTBU"), and stays ambiguous once a name printed in
 * capitals is shown in normal case ("Slimtbu"): the skeleton of each reading.
 */
export function skeletons(word: string): string[] {
  const base = skeleton(word);
  if (word[0] === word[0].toLowerCase() || !/t/i.test(word)) return [base];
  let out = [""];
  for (let i = 0; i < base.length; i++) {
    const options = base[i] === "t" && out.length < 8 ? ["t", "i"] : [base[i]];
    out = out.flatMap((s) => options.map((o) => s + o));
  }
  return out;
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

function parse(aff: string, dic: string): Dictionary {
  const d: Dictionary = { heads: new Map(), rules: new Map(), firstOfTwo: new Map(), second: new Set() };
  const addHead = (word: string, flags: string) => {
    const w = lower(word);
    push(d.heads, skeleton(w), { word: w, flags, proper: w !== word });
  };
  for (const line of dic.split("\n").slice(1)) {
    const m = /^([^/\s]+)(?:\/(\S+))?/.exec(line);
    if (m) addHead(m[1], m[2] ?? "");
  }
  // words of our own course titles the dictionary does not have ("diferenciāldiagnoze")
  for (const word of Object.keys(LEXICON)) addHead(word, "");

  const conds = new Map<string, RegExp | null>();
  for (const line of aff.split("\n")) {
    const p = line.trim().split(/\s+/);
    if (p[0] !== "SFX" || p.length < 5) continue;
    const [add, next = ""] = p[3].split("/");
    if (!conds.has(p[4])) conds.set(p[4], p[4] === "." ? null : new RegExp(`${p[4]}$`, "u"));
    const rule: Rule = { flag: p[1], strip: p[2] === "0" ? "" : p[2], add: add === "0" ? "" : add, next, cond: conds.get(p[4])! };
    const key = skeleton(rule.add);
    push(d.rules, key, rule);
    if (next.replace(/[\]\[|]/g, "")) {
      push(d.firstOfTwo, key, rule);
      for (const f of next) d.second.add(f);
    }
  }
  return d;
}

let loaded: Dictionary | null | undefined;

/** The dictionary, or null when its files cannot be read: then nothing gets corrected and parsing goes on */
function dictionary(): Dictionary | null {
  if (loaded !== undefined) return loaded;
  try {
    const dir = path.join(process.cwd(), "node_modules", "dictionary-lv");
    loaded = parse(readFileSync(path.join(dir, "index.aff"), "utf8"), readFileSync(path.join(dir, "index.dic"), "utf8"));
  } catch (err) {
    console.error("lvDictionary", err);
    loaded = null;
  }
  return loaded;
}

export const dictionaryAvailable = () => dictionary() !== null;

const applies = (rule: Rule, word: string) => word.endsWith(rule.strip) && (!rule.cond || rule.cond.test(word));
const swapEnd = (rule: Rule, word: string) => word.slice(0, word.length - rule.strip.length) + rule.add;

/** Does this rule go with this prefix? "lieto" of "jālieto" only with "jā" */
function prefixFits(rule: Rule, flag: string): boolean {
  if (rule.next.includes(CIRCUMFIX)) return flag !== "" && flag !== "-" && rule.next.includes(flag);
  return flag === "" || flag === "-";
}

function collect(d: Dictionary, key: string, prefix: string, flag: string, out: Map<string, boolean>) {
  const add = (form: string, proper: boolean) => out.set(prefix + form, proper || out.get(prefix + form) === true);
  const stemOk = (h: Head) => flag !== "-" || h.flags.includes("-");
  if (flag === "" || flag === "-") for (const h of d.heads.get(key) ?? []) if (!h.flags.includes(NEEDS_AFFIX) && stemOk(h)) add(h.word, h.proper);
  for (let i = 0; i <= key.length; i++) {
    for (const rule of d.rules.get(key.slice(i)) ?? []) {
      const stem = key.slice(0, i) + skeleton(rule.strip);
      if (prefixFits(rule, flag)) {
        for (const h of d.heads.get(stem) ?? []) {
          if (h.flags.includes(rule.flag) && stemOk(h) && applies(rule, h.word)) add(swapEnd(rule, h.word), h.proper);
        }
      }
      if (!d.second.has(rule.flag)) continue;
      // two levels: this rule ends a form another rule made
      for (let j = 0; j <= stem.length; j++) {
        for (const first of d.firstOfTwo.get(stem.slice(j)) ?? []) {
          if (!first.next.includes(rule.flag) || !prefixFits(first, flag)) continue;
          for (const h of d.heads.get(stem.slice(0, j) + skeleton(first.strip)) ?? []) {
            if (!h.flags.includes(first.flag) || !stemOk(h) || !applies(first, h.word)) continue;
            const form = swapEnd(first, h.word);
            if (applies(rule, form)) add(swapEnd(rule, form), h.proper);
          }
        }
      }
    }
  }
}

/** Every dictionary word with the skeleton of `word`, lowercase; true marks a name (the dictionary spells it with a capital) */
export function formsLike(word: string): Map<string, boolean> {
  const out = new Map<string, boolean>();
  const d = dictionary();
  if (!d || !/^[\p{Script=Latin}\d]+$/u.test(word)) return out;
  for (const key of skeletons(word)) {
    collect(d, key, "", "", out);
    for (const p of PREFIXES) {
      const start = skeleton(p.add);
      if (key.startsWith(start)) collect(d, key.slice(start.length), p.add, p.flag, out);
    }
  }
  return out;
}

/**
 * How often public course titles and organizers use this form; a dictionary cannot tell "kārtība" from "kartība", usage
 * can. lvLexicon.json: counted once, 05 Nov 2026, over the 684 titles our scrapers (lib/courses/sources) then returned.
 * Forms of 5 letters or more that the dictionary has, or that appear twice in lowercase with a Latvian letter; names the
 * dictionary spells with a capital only from 3 uses, so lecturers stay out. Not a certificate word in it.
 */
export const usage = (form: string): number => (LEXICON as Record<string, number>)[form] ?? 0;

/**
 * Words of our course titles ending in these letters, most used first: a logo swallowed the first letter or two of a
 * heading ("IRDS" under an emblem is "sirds").
 */
export function commonWordsEndingIn(ending: string, extra: number): string[] {
  const key = skeleton(ending);
  return Object.entries(LEXICON as Record<string, number>)
    .filter(([w]) => w.length > ending.length && w.length <= ending.length + extra && skeleton(w).endsWith(key))
    .sort((a, b) => b[1] - a[1])
    .map(([w]) => w);
}
