// lib/text.ts: one fold for search and matching. Each check pins one of the copies it replaced (Oct 2026 cleanup).
import { test } from "node:test";
import assert from "node:assert/strict";
import { fold, foldKey, stripMarks } from "../lib/text";
import { titleKey } from "../lib/courses/util";

const SAMPLES = [
  "Rīgas Stradiņa universitāte",
  "ĀĒĪŪ ČĢĶĻŅŠŽ āēīū čģķļņšž",
  "Latvijas Ārstu biedrība (LĀB), TIP2026/9696",
  "Неотложная помощь: Йошкар-Ола, ёлка",
  "  Kardioloģija -- 2. daļa!  ",
  "Ergoterapeits / Fizioterapeits",
  "İstanbul ẞtraße",
  "",
];

test("fold: lowercase, Latvian and Russian diacritics removed", () => {
  assert.equal(fold("Rīga ĀŠŽ"), "riga asz");
  assert.equal(fold("Йод, ёж"), "иод, еж");
  assert.equal(fold("ﬁzioterapija"), "fizioterapija");
});

test("stripMarks keeps case", () => {
  assert.equal(stripMarks("Ēriks Bērziņš"), "Eriks Berzins");
});

test("foldKey: one space between words, trimmed", () => {
  assert.equal(foldKey("  Latvijas Ārstu  biedrība (LĀB)! "), "latvijas arstu biedriba lab");
});

test("same output as the copies it replaced", () => {
  const old = {
    // lib/nurse.ts, lib/courses/util.ts, lib/export/validate.ts
    fold: (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase(),
    // lib/parse/index.ts foldKey, lib/parse/confidence.ts norm
    foldKey: (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim(),
    // lib/courses/util.ts titleKey
    titleKey: (s: string) => s.toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "").replace(/[^\p{L}\p{N}]+/gu, "").slice(0, 60),
    // components/SpecialtyPicker.tsx
    picker: (v: string) => v.toLocaleLowerCase("lv").normalize("NFD").replace(/[̀-ͯ]/g, ""),
    // components/admin/TranslationsAdmin.tsx
    admin: (v: string) => v.toLowerCase().normalize("NFD").replace(/\p{M}/gu, ""),
    // components/export/zip.ts slug, app/api/certificates/route.ts sanitizeName
    strip: (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, ""),
  };
  for (const s of SAMPLES) {
    assert.equal(fold(s), old.fold(s), s);
    assert.equal(foldKey(s), old.foldKey(s), s);
    assert.equal(titleKey(s), old.titleKey(s), s);
    assert.equal(fold(s), old.picker(s), s);
    assert.equal(fold(s), old.admin(s), s);
    assert.equal(stripMarks(s), old.strip(s), s);
  }
});
