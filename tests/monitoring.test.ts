// lib/monitoring: what an error report keeps (no personal data), how repeats group, and the day file's limits.
import { test } from "node:test";
import assert from "node:assert/strict";
import { deviceLabel, fingerprint, scrubMessage, scrubRoute, topFrame } from "../lib/monitoring/scrub";
import { MAX_EMAILS, MAX_ITEMS, mergeDay, toItem, type ErrorDay } from "../lib/monitoring/errors";
import { allowHit } from "../lib/monitoring/limit";
import { dayLv } from "../lib/monitoring/day";

test("scrubMessage removes emails, personal codes, numbers, tokens and quoted text", () => {
  const out = scrubMessage(
    `Failed for anna.berzina@gmail.com (pk 120389-12345 / 32123412345), tel +371 25262266, ` +
      `token=abc123 Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig, reset q4Xr9fT2mN8pL1vB7cZ0yW3sK6hJ5gD9aE2 ` +
      `title "Kardioloģijas kongress Jānis Bērziņš" at https://medserti.lv/atjaunot-paroli?token=secret#x`,
  );
  for (const leak of ["anna", "gmail", "120389", "12345", "32123412345", "25262266", "abc123", "eyJ", "q4Xr9", "Jānis", "Kardioloģ", "secret"])
    assert.ok(!out.includes(leak), `${leak} leaked: ${out}`);
  assert.match(out, /\[email\]/);
  assert.match(out, /\[code\]/);
  assert.match(out, /https:\/\/medserti\.lv\/atjaunot-paroli(?![?#])/);
  assert.match(out, /"…"/);
});

test("scrubMessage keeps a plain error readable, on one line and capped", () => {
  assert.equal(scrubMessage("TypeError: Cannot read properties of undefined\n  (reading x)"), "TypeError: Cannot read properties of undefined (reading x)");
  assert.equal(scrubMessage(null), "");
  assert.ok(scrubMessage("x".repeat(1000)).length <= 300);
});

test("scrubRoute keeps the path and replaces ids", () => {
  assert.equal(scrubRoute("/api/certificates/k3j9x2a/file?x=1#y"), "/api/certificates/:id/file");
  assert.equal(scrubRoute("https://medserti.lv/atjaunot-paroli?token=abc"), "/atjaunot-paroli");
  assert.equal(scrubRoute("/users/0f1e2d3c-aaaa-4bbb-8ccc-123456789abc/certs"), "/users/:id/certs");
  assert.equal(scrubRoute("/u/anna%40gmail.com"), "/u/:id");
  assert.equal(scrubRoute("/api/certificates/[id]"), "/api/certificates/[id]");
  assert.equal(scrubRoute("/certificates"), "/certificates");
  assert.equal(scrubRoute(undefined), "/");
});

test("topFrame picks the first frame from our code, without origin or query string", () => {
  const chrome = [
    "TypeError: x is undefined",
    "    at Object.fn (https://medserti.lv/_next/static/chunks/node_modules_react-dom_1a.js:1:100)",
    "    at deleteRow (https://medserti.lv/_next/static/chunks/app/certificates/page-1a2b.js?dpl=dpl_x:3:2345)",
  ].join("\n");
  assert.equal(topFrame(chrome), "deleteRow app/certificates/page-1a2b.js:3");
  const safari = "deleteRow@https://medserti.lv/_next/static/chunks/app/page-9.js:1:20\nglobal code@";
  assert.equal(topFrame(safari), "deleteRow chunks/app/page-9.js:1");
  const server = "Error: boom\n    at saveCertificate (/var/task/.next/server/chunks/lib_db.js:42:11)\n    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)";
  assert.equal(topFrame(server), "saveCertificate chunks/lib_db.js:42");
  assert.equal(topFrame(undefined), "");
});

test("fingerprint groups repeats and splits different places", () => {
  const a = fingerprint(scrubMessage("Failed 3 of 12 for a@b.lv"), "/certificates", "f x.js:1");
  const b = fingerprint(scrubMessage("Failed 5 of 40 for c@d.lv"), "/certificates", "f x.js:1");
  assert.equal(a, b);
  assert.notEqual(a, fingerprint(scrubMessage("Failed 3 of 12"), "/dashboard", "f x.js:1"));
  assert.notEqual(a, fingerprint(scrubMessage("Failed 3 of 12"), "/certificates", "g y.js:9"));
  assert.match(a, /^[0-9a-f]{12}$/);
});

test("toItem scrubs everything and stores the user only as a one-way tag", () => {
  const userId = "5b2c1f7e-0000-4000-8000-1234567890ab";
  const it = toItem({ source: "ui", kind: "certDelete", status: 412, message: "certDelete failed for anna@x.lv", route: "/certificates?id=5", userId, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1" });
  const json = JSON.stringify(it);
  assert.ok(!json.includes("anna") && !json.includes(userId) && !json.includes("id=5"));
  assert.equal(it.route, "/certificates");
  assert.equal(it.users.length, 1);
  assert.match(it.users[0], /^[0-9a-f]{10}$/);
  assert.equal(it.device, "Safari 18 · iOS · mobile");
  // the same user tags the same way, so a count of people is possible without knowing who
  assert.equal(toItem({ source: "ui", message: "x", route: "/", userId }).users[0], it.users[0]);
});

test("mergeDay counts repeats, emails only new fingerprints, and caps emails and entries", () => {
  const empty: ErrorDay = { day: "2026-10-22", emails: 0, dropped: 0, items: {} };
  const one = toItem({ source: "server", message: "boom", route: "/api/x" });
  let r = mergeDay(empty, [one]);
  assert.equal(r.alert.length, 1);
  r = mergeDay(r.file, [{ ...one, count: 4 }]);
  assert.equal(r.alert.length, 0);
  assert.equal(r.file.items[one.fp].count, 5);

  // letters, not digits: digits are evened out in the fingerprint
  const letters = (i: number) => String.fromCharCode(97 + (i % 26), 97 + Math.floor(i / 26));
  const many = Array.from({ length: MAX_ITEMS + 5 }, (_, i) => toItem({ source: "server", message: "boom", route: `/api/${letters(i)}` }));
  const big = mergeDay(empty, many);
  assert.equal(Object.keys(big.file.items).length, MAX_ITEMS);
  assert.equal(big.file.dropped, 5);
  assert.equal(big.alert.length, MAX_EMAILS);
  assert.equal(big.file.emails, MAX_EMAILS);
});

test("allowHit limits per key within the window", () => {
  const t0 = 1_000_000;
  for (let i = 0; i < 3; i++) assert.ok(allowHit("test:a", 3, 1000, t0 + i));
  assert.ok(!allowHit("test:a", 3, 1000, t0 + 10));
  assert.ok(allowHit("test:b", 3, 1000, t0 + 10));
  assert.ok(allowHit("test:a", 3, 1000, t0 + 2000));
});

test("deviceLabel names browser, OS and mobile; dayLv uses Latvian time", () => {
  assert.equal(deviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0"), "Edge 141 · Windows");
  assert.equal(deviceLabel("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/141.0 Mobile Safari/537.36"), "Chrome 141 · Android · mobile");
  assert.equal(deviceLabel(""), "");
  // 22:30 UTC on 21 Oct is already 22 Oct in Riga (UTC+3 in summer time)
  assert.equal(dayLv(new Date("2026-10-21T22:30:00Z")), "2026-10-22");
});
