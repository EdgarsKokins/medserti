import "server-only";
import { dictionaryAvailable, formsLike, skeletons, usage } from "./lvDictionary";

/*
 * The last step of reading a Latvian certificate: the title and organizer, cross-checked word by word.
 * Scans lose Latvian letters, and a word can stay a word without them ("mainas", "mainās"), so what the document itself
 * says comes first: another reading in the same place, then anywhere else. Only then the dictionary, with our own
 * course titles to choose between its candidates. A word nothing speaks for stays as it was: a wrong letter a doctor
 * can see is better than a right-looking word nobody wrote.
 */

/** What a letter can really be when OCR printed this one. Latvian letters are never lost or swapped. */
const MISREAD: Record<string, string> = {
  a: "ā", e: "ē", i: "ī", u: "ū", c: "č", s: "š", z: "ž", g: "ģ", k: "ķ", n: "ņ",
  l: "iīļ", o: "ā", 1: "iī", 0: "ū",
  á: "āa", à: "āa", â: "āa", ä: "āa", ã: "āa", å: "āa",
  é: "ēe", è: "ēe", ê: "ēe", ë: "ēe",
  í: "īi", ì: "īi", î: "īi", ï: "īi",
  ó: "āo", ò: "āo", ô: "āo", ö: "āo", õ: "āo",
  ú: "ūu", ù: "ūu", û: "ūu", ü: "ūu",
  ç: "čc", ñ: "ņn", ś: "šs", ź: "žz", ż: "žz",
};
const LATVIAN = /[āčēģīķļņšūž]/g;
/** Shorter words are mostly logo debris and valid in too many spellings ("mas", "KATS") */
const MIN_LETTERS = 5;
/** Of a document's words, the share that must be Latvian, misread or not. Measured: Latvian scans 0.55 to 0.93, English, Lithuanian, German 0.13 at most */
const LATVIAN_SHARE = 0.4;
/** Words checked to decide the language */
const SAMPLE = 150;

const WORD = /[\p{L}\d]*\p{L}[\p{L}\d]*/gu;
const lower = (s: string) => s.toLocaleLowerCase("lv");
/** In capitals, apart from the "i" and "l" Adobe prints for "Ī" ("VITAMiNA", "KLlNIKA") */
const isCaps = (w: string) => /\p{Lu}.*\p{Lu}/u.test(w) && !/[^\P{Ll}il]/u.test(w);
const isCapitalised = (w: string) => w[0] !== w[0].toLowerCase() && !isCaps(w);
const letterCount = (w: string) => w.replace(/\d/g, "").length;

/** Letters of `form` that differ from `word`, or -1 when OCR cannot have read the one as the other */
function changes(word: string, form: string): number {
  const w = lower(word);
  if (w.length !== form.length) return -1;
  let n = 0;
  for (let i = 0; i < w.length; i++) {
    if (w[i] === form[i]) continue;
    // Adobe's "T" for "ī" (lowercase once a name in capitals is shown in normal case: skeletons())
    if (!MISREAD[w[i]]?.includes(form[i]) && !(w[i] === "t" && form[i] === "ī")) return -1;
    // Adobe's "o" for "ā" is the small letter only: a capital O is an O, or some other letter ("KRŪTS")
    if (word[i] === "O" && form[i] === "ā") return -1;
    n++;
  }
  return n;
}

/** The forms OCR can have read as this word, the word itself included when it is one */
function readingsOf(word: string): Map<string, { name: boolean; changes: number }> {
  const out = new Map<string, { name: boolean; changes: number }>();
  for (const [form, name] of formsLike(word)) {
    const n = changes(word, form);
    if (n >= 0) out.set(form, { name, changes: n });
  }
  return out;
}

const isWord = (word: string) => readingsOf(word).get(lower(word))?.changes === 0;

/** `form` with the case of `word`; Adobe's "T" for "ī" is no capital, and a first "l" that became "i" was a capital I ("lnese") */
function withCase(word: string, form: string): string {
  if (isCaps(word)) return form.toLocaleUpperCase("lv");
  let out = "";
  for (let i = 0; i < form.length; i++) {
    const adobeT = word[i] === "T" && form[i] === "ī";
    out += (word[i] !== word[i].toLowerCase() && !adobeT) || (i === 0 && word[0] === "l" && form[0] === "i") ? form[i].toLocaleUpperCase("lv") : form[i];
  }
  return out;
}

/** Clear use decides over fewer changes: at least this many course titles ("kārtība"), and this many times the runner-up */
const CLEAR_USE = 2;
const CLEAR_RATIO = 3;
/** A capitalised word counts as a common word from this many course titles and organizers: fewer may be a lecturer's name */
const COMMON_USE = 3;

/**
 * The form to take: clearly the most used in our course titles, else fewest letters changed, else the more used.
 * A word with a real "o" keeps it when it can ("funkcionālo", not "funkcionālā"). A tie is no answer.
 */
function best(all: string[], word: string): string | null {
  const noSwap = all.filter((f) => [...f].every((c, i) => c !== "ā" || lower(word)[i] !== "o"));
  const forms = noSwap.length ? noSwap : all;
  const byUse = [...forms].sort((a, b) => usage(b) - usage(a));
  if (usage(byUse[0] ?? "") >= CLEAR_USE && usage(byUse[0]) >= CLEAR_RATIO * usage(byUse[1] ?? "")) return byUse[0];
  const fewest = Math.min(...forms.map((f) => changes(word, f)));
  const closest = byUse.filter((f) => changes(word, f) === fewest);
  if (closest.length > 1 && usage(closest[0]) === usage(closest[1])) return null;
  return closest[0] ?? null;
}

/** Does the text read as Latvian, counting words a scan misread? Raw dictionary hits alone are 35% on real scans. */
function latvianShare(words: string[]): number {
  const long = [...new Set(words.filter((w) => letterCount(w) >= 4))].slice(0, SAMPLE);
  if (!long.length) return 0;
  return long.filter((w) => readingsOf(w).size > 0).length / long.length;
}

export type Field = "title" | "organizer";

/**
 * The checker for one document, or the identity when it is not Latvian. `own` is the word the parser wrote itself
 * ("sēde" of "piedalījās X sēdē"): the document's "sēdē" in that place says nothing about them.
 */
export function latvianChecker(doc: string): (value: string, field: Field, own?: string) => string {
  const words = doc.match(WORD) ?? [];
  if (!words.length || !dictionaryAvailable() || latvianShare(words) < LATVIAN_SHARE) return (value) => value;
  const keys = words.map(skeletons);
  const where = new Map<string, number[]>();
  keys.forEach((list, i) => {
    for (const k of list) {
      const at = where.get(k);
      if (at) at.push(i);
      else where.set(k, [i]);
    }
  });
  const same = (a: string[], b: string[] | undefined) => !!b && a.some((k) => b.includes(k));

  return (value, field, own) => {
    const parts = [...value.matchAll(WORD)].map((m) => m[0]);
    // an English title on a Latvian certificate
    if (latvianShare(parts) < LATVIAN_SHARE) return value;
    const fieldKeys = parts.map(skeletons);
    const allCaps = !/[^\P{Ll}il]/u.test(value);

    const check = (word: string, i: number): string => {
      if (letterCount(word) < MIN_LETTERS || lower(word) === own) return word;
      const readings = readingsOf(word);
      const self = lower(word);
      const known = readings.get(self)?.changes === 0;

      // the document's other readings of this word that are words; the same place means its neighbours match too
      const here = new Set<string>();
      const there = new Set<string>();
      for (const k of fieldKeys[i]) {
        for (const at of where.get(k) ?? []) {
          const reading = lower(words[at]);
          if (reading === self || changes(word, reading) < 0 || !isWord(words[at])) continue;
          const before = i === 0 || same(fieldKeys[i - 1], keys[at - 1]);
          const after = i === parts.length - 1 || same(fieldKeys[i + 1], keys[at + 1]);
          if (parts.length > 1 && before && after) here.add(reading);
          else there.add(reading);
        }
      }
      const addsLetters = (f: string) => (f.match(LATVIAN) ?? []).length > (self.match(LATVIAN) ?? []).length;
      const fromHere = best(known ? [...here].filter(addsLetters) : [...here], word);
      if (fromHere) return withCase(word, fromHere);
      if (known || here.size) return word;
      if (there.size) {
        const fromThere = best([...there], word);
        return fromThere ? withCase(word, fromThere) : word;
      }

      // a capital mid-title may be a surname that happens to spell a common word ("Pavars", "pavārs"): only a
      // name the dictionary knows, or a word our course titles and organizers use, gets letters from here on.
      // A run of words in capitals is a heading, a lone one may be a surname.
      const capsRun = isCaps(word) && (allCaps || isCaps(parts[i - 1] ?? "") || isCaps(parts[i + 1] ?? ""));
      const nameLike = (field === "organizer" || i > 0) && !capsRun && (isCapitalised(word) || isCaps(word));
      const forms = [...readings].filter(([f, r]) => r.changes > 0 && (!nameLike || r.name || usage(f) >= COMMON_USE)).map(([f]) => f);
      const pick = best(forms, word);
      return pick ? withCase(word, pick) : word;
    };

    let i = 0;
    return value.replace(WORD, (word) => check(word, i++));
  };
}
