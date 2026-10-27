// Language addresses for public pages (lib/locale.ts). Run: npx tsx --test tests/locale-paths.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { isPublicPath, languageAlternates, localeFromAcceptLanguage, localePath, splitLocalePath } from "../lib/locale";

test("Latvian has no prefix, the others do", () => {
  assert.equal(localePath("/", "lv"), "/");
  assert.equal(localePath("/", "ru"), "/ru");
  assert.equal(localePath("/par-mums", "en"), "/en/par-mums");
});

test("an address splits into language and page", () => {
  assert.deepEqual(splitLocalePath("/ru"), { locale: "ru", path: "/" });
  assert.deepEqual(splitLocalePath("/en/kontakti"), { locale: "en", path: "/kontakti" });
  assert.deepEqual(splitLocalePath("/privatums"), { locale: "lv", path: "/privatums" });
  // a page whose name starts with the letters is not a prefix
  assert.deepEqual(splitLocalePath("/register"), { locale: "lv", path: "/register" });
});

test("only the five public pages get language addresses", () => {
  assert.ok(isPublicPath("/") && isPublicPath("/noteikumi"));
  assert.ok(!isPublicPath("/dashboard") && !isPublicPath("/login"));
});

test("hreflang lists every version and points x-default at Latvian", () => {
  assert.deepEqual(languageAlternates("/kontakti", "ru"), {
    canonical: "/ru/kontakti",
    languages: { lv: "/kontakti", en: "/en/kontakti", ru: "/ru/kontakti", "x-default": "/kontakti" },
  });
});

test("only a browser ranking Russian first is offered Russian", () => {
  assert.equal(localeFromAcceptLanguage("ru-RU,ru;q=0.9,lv;q=0.8"), "ru");
  assert.equal(localeFromAcceptLanguage("lv-LV,lv;q=0.9,ru;q=0.8"), null);
  assert.equal(localeFromAcceptLanguage(null), null);
});
