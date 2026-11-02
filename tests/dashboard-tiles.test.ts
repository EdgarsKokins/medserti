// Dashboard tiles (November 2026): the greeting's name and the emergency care tag on courses
import { test } from "node:test";
import assert from "node:assert/strict";
import { greetName } from "../components/dashboard/model";
import { isEmergencyCourse } from "../lib/courses/types";

test("greeting: Latvian vocative of the first name, other languages as written", () => {
  assert.equal(greetName("Jānis Paraugs", "lv"), "Jāni");
  assert.equal(greetName("Edgars Kokins", "lv"), "Edgar");
  assert.equal(greetName("Andrejs Bērziņš", "lv"), "Andrej");
  assert.equal(greetName("Krišjānis Barons", "lv"), "Krišjāni");
  assert.equal(greetName("Anna Liepa", "lv"), "Anna");
  assert.equal(greetName("Inese Ozola", "lv"), "Inese");
  assert.equal(greetName("Jānis Paraugs", "en"), "Jānis");
  assert.equal(greetName("Jānis Paraugs", "ru"), "Jānis");
  assert.equal(greetName("  ", "lv"), "");
});

test("emergency care courses are found by title or audience", () => {
  const c = (title: string, audience = "") => ({ title, audience });
  assert.ok(isEmergencyCourse(c("Neatliekamā medicīniskā palīdzība vitālo funkciju saglabāšanā")));
  assert.ok(isEmergencyCourse(c("Pirmā palīdzība darba vietā")));
  assert.ok(isEmergencyCourse(c("Kardiopulmonālā reanimācija pieaugušajiem")));
  assert.ok(isEmergencyCourse(c("BLS/AED kurss")));
  assert.ok(isEmergencyCourse(c("Kursi", "NMP brigāžu ārsti")));
  assert.ok(!isEmergencyCourse(c("Rinoloģija")));
  assert.ok(!isEmergencyCourse(c("Dermatoloģijas akadēmija 12.0")));
  // "ALS" inside a word is not advanced life support
  assert.ok(!isEmergencyCourse(c("Cervikālās sāpes")));
});
