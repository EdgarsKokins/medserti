// Course sources added for Kārlis Stirāns #14 (November 2026): LU P. Stradiņa medicīnas koledža, the dentists'
// association (LZA) and kosmetologs.lv. Fixtures are trimmed copies of the sites' markup, contact details left out.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePskFeed, parsePskPost, toPskCourse } from "../lib/courses/sources/lupsk";
import { lzaDate, parseLzaList, toLzaCourse, venueOf } from "../lib/courses/sources/lza";
import { kosmetologsTip, parseKosmetologsEvent, parseKosmetologsList } from "../lib/courses/sources/kosmetologs";

const TODAY = "2026-11-02";

const item = (title: string, cat: string, slug: string) =>
  `<item><title><![CDATA[${title}]]></title><link>https://psk.lu.lv/post/${slug}</link><category><![CDATA[${cat}]]></category></item>`;

test("LU PSK feed: dated continuing-education posts only", () => {
  const xml = `<rss><channel>${[
    item("Infekciju kontroles un profilakses pasākumi ārstniecības iestādē, 14.11.2026.", "Tālākizglītība", "infekciju"),
    item("Sensoru līdzekļu pielietojums darbā ar mērķa grupu, 12.-13.11.2026.", "Tālākizglītība", "sensoru"),
    item("Neformālās izglītības programma, 14.11.2026. (tiešsaistē)", "Tālākizglītība", "neformalas"),
    item("Tālākizglītības kursi profesionāļiem, 31.10.2026. (tiešsaistē)", "Tālākizglītība", "pagajis"),
    item("LU PSK dalība taktiskās mācībās", "Aktualitātes", "macibas"),
    item("Māsas specializācija 14.12.2026. (PIETEIKŠANĀS NOSLĒGUSIES)", "Tālākizglītība", "slegts"),
  ].join("")}</channel></rss>`;
  const rows = parsePskFeed(xml, TODAY);
  assert.deepEqual(rows.map((r) => r.title), [
    "Sensoru līdzekļu pielietojums darbā ar mērķa grupu",
    "Infekciju kontroles un profilakses pasākumi ārstniecības iestādē",
    "Neformālās izglītības programma",
  ]);
  assert.deepEqual([rows[0].date, rows[0].endDate], ["2026-11-12", "2026-11-13"]);
  assert.equal(rows[2].online, true);
});

const post = (body: string) => `<main><p>Lasīts 1 min</p>${body}<p>Tagi:</p><p>Jaunākie ieraksti</p></main>`;

test("LU PSK post: labels in their different wordings", () => {
  const a = parsePskPost(
    post(
      `<p>LU PSK aicina pieteikties programmai “Infekciju kontroles pasākumi”.</p><p>Norises datums:</p><p>14.11.2026. (sestdiena), plkst. 09.00-16.00</p>` +
        `<p>Norises vieta:</p><p>attālināti, MS Teams platformā</p><p>Mērķauditorija:</p><p>māsas, māsu palīgi, podologi</p>` +
        `<p>Kursu apjoms:</p><p>8 TIP (apstiprināts LMa NTI/P-1611; LĀPPOS Nr. TIP2025/237)</p><p>Dalības maksa:</p><p>30 EUR (ar PVN), maksājums jāveic līdz 09.11.2026.</p>`,
    ),
  );
  assert.deepEqual(a, {
    name: "Infekciju kontroles pasākumi",
    time: "09:00-16:00",
    location: "attālināti, MS Teams platformā",
    audience: "māsas, māsu palīgi, podologi",
    tip: 8,
    price: "30 EUR (ar PVN)",
    free: false,
  });
  const b = parsePskPost(
    post(
      `<p>LU PSK izsludina pieteikšanos programmai “GERIATRISKU KLIENTU UZTURA ĪPATNĪBAS”</p><p>Norises laiks:</p><p>04.12.2026., no plkst. 15.00</p>` +
        `<p>Kursu norise:</p><p>ATTĀLINĀTI</p><p>Tālākizglītības punkti:</p><p>8 TIP (apstiprināts Latvijas Māsu asociācijā)</p><p>Dalības maksa:</p><p>30 EUR (maksā līdz 01.12.)</p>`,
    ),
  );
  assert.equal(b.time, "15:00");
  assert.equal(b.location, "ATTĀLINĀTI");
  assert.equal(b.tip, 8);
  assert.equal(b.price, "30 EUR");
  // "16 akadēmiskās stundas" for social workers is not TIP
  assert.equal(parsePskPost(post(`<p>organizē apmācības</p><p>Apmācību apjoms:</p><p>16 akadēmiskās stundas</p>`)).tip, null);
  // a generic feed title takes the programme's name, out of capitals
  const c = toPskCourse({ date: "2026-12-04", endDate: null, title: "Neformālās izglītības programma", url: "https://psk.lu.lv/post/x", online: true }, b);
  assert.equal(c.title, "Geriatrisku klientu uztura īpatnības");
  assert.equal(c.city, "Online");
  assert.equal(c.source, "lupsk");
});

test("LZA dates: three ways of writing them, the event date before the registration date", () => {
  assert.equal(lzaDate("Straumann Forums 2026 | 04.12.2026.", "2026-09-30"), "2026-12-04");
  assert.equal(lzaDate("LZA konference. 2026. gada 21. novembris. Reģistrācija no 10.11.2026.", "2026-10-19"), "2026-11-21");
  assert.equal(lzaDate("5. decembrī PACIENTU DATU AIZSARDZĪBA attālināti", "2026-10-30"), "2026-12-05");
  // posted in December, held in January: the next year
  assert.equal(lzaDate("15. janvārī seminārs", "2026-12-10"), "2027-01-15");
  assert.equal(lzaDate("Valdes vēlēšanu rezultāti", "2026-06-10"), null);
});

const lzaItem = (title: string, posted: string, teaser: string, slug: string) =>
  `<h2><a href="https://www.lza-zobi.lv/lv/${slug}" title="${title}">${title}</a></h2>` +
  `<p class="forum-author"><span class="forum-info">Ievietots: ${posted}</span></p><div class="news-comment"> ${teaser}</div>`;

test("LZA list: future courses and conferences, not other news", () => {
  const html = [
    lzaItem("LZA konference Digitālā zobārstniecība. 2026. gada 21. novembris.", "2026.10.19", "2026. gada 21. novembris.\nRadisson Blue Daugava, Kuģu iela 24, Rīga\nReģistrācija LZA mājaslapā no 10.11.2026.", "konference"),
    lzaItem("No šā gada 25. augusta stāsies spēkā grozījumi", "2026.08.14", "Grozījumi apstarošanas kontrolē", "grozijumi"),
    lzaItem("Jaunā cenrāža spēkā stāšanās 1. decembrī", "2026.10.01", "Biedru naudas maiņa", "cenradis"),
  ].join("\n");
  const rows = parseLzaList(html, TODAY);
  assert.deepEqual(rows.map((r) => r.date), ["2026-11-21", "2026-12-01"]);
  const conf = toLzaCourse(rows[0], null)!;
  assert.equal(conf.title, "LZA konference Digitālā zobārstniecība.");
  assert.equal(conf.location, "Radisson Blue Daugava, Kuģu iela 24, Rīga");
  assert.equal(conf.city, "Rīga");
  assert.equal(conf.organizer, "Latvijas Zobārstu asociācija");
  assert.equal(conf.audience, "Zobārsti");
  // future-dated news that names no TIP and is not a course is left out
  assert.equal(toLzaCourse(rows[1], { text: "Biedru nauda", tip: null, time: null, price: null }), null);
  assert.equal(venueOf("21. konference, kas norisināsies 12.novembrī viesnīcā Radisson Hotel Daugava, zālē un tiešsaistē Evisit.lv"), "Radisson Hotel Daugava, tiešsaistē");
});

test("kosmetologs.lv: TIP from the description, never the approval number", () => {
  assert.equal(kosmetologsTip("+ 8 LĀPPOS tālākizglītības punkti\nLĀPPOS, Nr.TIP2025/652 TIP8 (klātiene)"), 8);
  assert.equal(kosmetologsTip("LĀPPOS Nr.TIP2025/205 TIP5"), 5);
  assert.equal(kosmetologsTip("Praktiskais kurss"), null);
});

test("kosmetologs.lv: event pages from the seminars list, read from their schema.org Event", () => {
  const base = "https://www.kosmetologs.lv/lv/blank-1/";
  const list = parseKosmetologsList(`<a href="${base}matu-izkrisana-online">x</a><a href="${base}mezoterapija-2026-11-17-11-00-1">y</a><a href="${base}vecs-2026-10-01-11-00">z</a>`, TODAY);
  assert.deepEqual(list, [`${base}mezoterapija-2026-11-17-11-00-1`, `${base}matu-izkrisana-online`]);
  const ld = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: "Kolagēnterapijas metodes pielietošana (klātienē ar praksi)",
    description: "+ 8 LĀPPOS tālākizglītības punkti\nLĀPPOS, Nr.TIP2025/652 TIP8 (klātiene)\n\nSemināra cena: 60 eiro",
    startDate: "2026-12-03T11:00:00+02:00",
    endDate: "2026-12-03T17:30:00+02:00",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: { "@type": "Place", name: "Artilērijas iela 67", address: "Artilērijas iela 67, Latgales priekšpilsēta, Rīga, LV-1009, Latvia" },
  };
  const html = `<script type="application/ld+json">${JSON.stringify(ld)}</script>`;
  const c = parseKosmetologsEvent(html, `${base}kolagenterapija-2026-12-03-11-00`, TODAY)!;
  assert.equal(c.startDate, "2026-12-03");
  assert.equal(c.time, "11:00-17:30");
  assert.equal(c.tip, 8);
  assert.equal(c.price, "60 EUR");
  assert.equal(c.city, "Rīga");
  assert.equal(c.format, "in_person");
  assert.equal(c.approvalId, "TIP2025/652");
  // a past event is not listed
  assert.equal(parseKosmetologsEvent(html, `${base}x`, "2026-12-04"), null);
});
