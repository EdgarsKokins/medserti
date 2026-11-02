// Latvian Physiotherapists Association event plan (lib/courses/sources/lfa.ts). Run: npx tsx --test tests/courses-lfa.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLfaEvent, parseLfaList, toLfaCourse } from "../lib/courses/sources/lfa";

// synthetic list in the site's markup: one past event, one of the association's own, one posted for another organizer
const row = (date: string, year: string, href: string, title: string, time: string, category: string) => `
    <div class="views-row"><div class="views-field views-field-nothing"><span class="field-content"><div class="box date-box">
      <span class="date">${date}</span>
      <span class="year">${year}</span>
</div>
<div class="box title-box">
      <span class="title"><a href="${href}" hreflang="lv">${title}</a></span>
      <span class="time">${time}<span class="category">${category}</span>
</div></span></div></div>`;
const list = `<div class="view-content">${[
  row("20.10", "2026", "/lv/notikumi/past", "Pagājis seminārs", "10:00", "Citi"),
  row("20.11", "2026", "/lv/notikumi/demo-seminars", "LFA MC seminārs &quot;Demo cīpslas&quot;", "14:00", "LFA"),
  row("13.11", "2026", "/lv/notikumi/demo-kursi", "Demo manuālās terapijas kursi", "10:00", "Citi"),
].join("")}</div>`;

test("the list keeps upcoming events with date, time, title, link and category", () => {
  const rows = parseLfaList(list, "2026-11-02");
  assert.deepEqual(rows.map((r) => [r.date, r.time, r.title, r.category]), [
    ["2026-11-20", "14:00", 'LFA MC seminārs "Demo cīpslas"', "LFA"],
    ["2026-11-13", "10:00", "Demo manuālās terapijas kursi", "Citi"],
  ]);
  assert.equal(rows[0].url, "https://fizioterapeitiem.lv/lv/notikumi/demo-seminars");
});

const page = (body: string) => `<html><div class="field field--name-field-date-range">${body}</div><div>LFA Sertifikācijas Komisija <p>tālr. +371 20000000</p></div></html>`;

test("an event page gives place, fee, TIP and the last day", () => {
  const d = parseLfaEvent(page(`<p>13.11.2026 10:00 - 17.11.2026 17:00</p>
    <p>Norises vieta: Demo centrs, Kr.Barona 1, Rīga</p><p>Dalības maksa: 50 EUR + PVN</p><p>Kursi tiek novērtēti ar 40 TIP</p>`));
  assert.deepEqual(d, { endDate: "2026-11-17", location: "Demo centrs, Kr.Barona 1, Rīga", price: "50 EUR + PVN", free: false, tip: 40 });
});

test("a fee free for members only is not free; an online place makes an online course for physiotherapists", () => {
  const rows = parseLfaList(list, "2026-11-02");
  const d = parseLfaEvent(page(`<p>20.11.2026 14:00 - 20.11.2026 18:00</p><p>Semināra norises vieta:</p><p>tiešsaistē zoom platformā</p>
    <p>Dalības maksa:</p><p>LFA biedriem bez maksas, citiem interesentiem 25 eur</p>`));
  assert.equal(d.free, false);
  assert.equal(d.endDate, null);
  const c = toLfaCourse(rows[0], d);
  assert.equal(c.format, "online_live");
  assert.equal(c.city, "Online");
  assert.equal(c.organizer, "Latvijas Fizioterapeitu asociācija");
  assert.equal(c.audience, "Fizioterapeiti");
  assert.equal(c.time, "14:00");
  // another organizer's event: the association is not named as its organizer
  assert.equal(toLfaCourse(rows[1], null).organizer, null);
});
