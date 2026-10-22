/**
 * Read-only check of the /admin text overrides against the current code (code review D5, Oct 2026).
 *
 * The course texts moved from components/courses/strings.ts into the main dictionary (Dict.courses). Their override
 * keys did not change: they were "courses.<path>" before and are "courses.<path>" now. This script proves it on the
 * real stored file: every stored key is looked up in the /admin catalog, then the overrides are applied and each
 * "courses." text must show up in t(locale).courses. It never writes anything.
 *
 * Run from the app folder (local store: ./.data; production: set BLOB_READ_WRITE_TOKEN, read access is enough):
 *   npx tsx --conditions=react-server scripts/check-i18n-overrides.ts
 *   npx tsx --conditions=react-server scripts/check-i18n-overrides.ts --file overrides.json   # a downloaded copy
 * Exit code 1 if any stored override would stop applying.
 */
import { readFile } from "node:fs/promises";
import { LOCALES, t } from "../lib/i18n";
import { catalog, compileOverrides, emptyOverrides, type StoredOverrides } from "../lib/i18n/catalog";
import { readStoredOverrides } from "../lib/i18n/overrides-server";
import { setI18nOverrides } from "../lib/i18n/overrides";

async function load(): Promise<StoredOverrides> {
  const i = process.argv.indexOf("--file");
  if (i < 0) return readStoredOverrides();
  const raw = JSON.parse(await readFile(process.argv[i + 1], "utf8")) as Record<string, Record<string, unknown>>;
  const out = emptyOverrides();
  for (const l of LOCALES) for (const [k, v] of Object.entries(raw?.[l] ?? {})) if (typeof v === "string") out[l][k] = v;
  return out;
}

const at = (root: unknown, key: string) =>
  key.split(".").reduce<unknown>((n, p) => (n && typeof n === "object" ? (n as Record<string, unknown>)[p] : undefined), root);

async function main() {
  const stored = await load();
  const { byKey } = catalog();
  const problems: string[] = [];
  let total = 0;
  let courses = 0;
  for (const l of LOCALES) {
    for (const [key, value] of Object.entries(stored[l])) {
      total++;
      if (key.startsWith("courses.")) courses++;
      const cell = byKey.get(key)?.[l];
      if (!cell) problems.push(`${l} ${key}: not in the catalog any more, so it is ignored`);
      else if (cell.kind === "code") problems.push(`${l} ${key}: read-only in /admin (plural forms or conditions), so it is ignored, as before`);
      else if (cell.kind === "text" && typeof at(t(l), key) === "string" && value.trim() === "") problems.push(`${l} ${key}: empty`);
    }
  }

  // apply them as the site does and read the course texts back
  setI18nOverrides(compileOverrides(stored));
  for (const l of LOCALES) {
    for (const [key, value] of Object.entries(stored[l])) {
      if (!key.startsWith("courses.") || byKey.get(key)?.[l]?.kind !== "text") continue;
      if (at(t(l), key) !== value) problems.push(`${l} ${key}: stored text does not reach t("${l}").${key}`);
    }
  }
  setI18nOverrides({});

  console.log(`${total} stored overrides (${courses} course texts), ${problems.length} problems`);
  for (const p of problems) console.log(`  ${p}`);
  process.exit(problems.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
