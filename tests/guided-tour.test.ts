// The guided tour (November 2026): who gets it, and that a missing element drops a step instead of stalling the tour
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { availableSteps, isShown, nextIndex, placeBubble, scrollTopFor, shouldAutoStart, TOUR_STEPS, type TourStep } from "../lib/tour";
import { baseDict } from "../lib/i18n";
import { catalog } from "../lib/i18n/catalog";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("starts by itself only for a new account", () => {
  assert.equal(shouldAutoStart({ certificates: 0, demo: false }), true);
  assert.equal(shouldAutoStart({ seenAt: "2026-11-05T10:00:00.000Z", certificates: 0, demo: false }), false, "already seen or skipped");
  assert.equal(shouldAutoStart({ certificates: 3, demo: false }), false, "already using Medserti");
  assert.equal(shouldAutoStart({ certificates: 0, demo: true }), false, "the shared demo account cannot remember it");
});

test("an element without a size, or hidden, is not shown", () => {
  const style = { display: "block", visibility: "visible", opacity: "1" };
  assert.equal(isShown({ width: 100, height: 40 }, style), true);
  assert.equal(isShown({ width: 0, height: 0 }, style), false, "display:none on a parent leaves no box");
  assert.equal(isShown({ width: 100, height: 40 }, { ...style, display: "none" }), false);
  assert.equal(isShown({ width: 100, height: 40 }, { ...style, visibility: "hidden" }), false);
  assert.equal(isShown({ width: 100, height: 40 }, { ...style, opacity: "0" }), false);
});

test("missing targets are skipped", () => {
  const without = (...gone: TourStep[]) => (s: TourStep) => !gone.includes(s);
  assert.deepEqual(availableSteps(TOUR_STEPS, without("date")), ["certs", "courses", "lectures", "ring", "tabs", "upload"], "date set: no date step");
  assert.deepEqual(availableSteps(TOUR_STEPS, without("courses", "ring")), ["certs", "lectures", "date", "tabs", "upload"]);
  assert.deepEqual(availableSteps(TOUR_STEPS, () => false), [], "nothing to point at: the tour does not open");
  assert.equal(TOUR_STEPS.at(-1), "upload", "it ends on doing");
});

test("a target that goes away during the tour never stalls it", () => {
  const list = [...TOUR_STEPS];
  const gone = (...g: TourStep[]) => (s: TourStep) => !g.includes(s);
  assert.equal(nextIndex(list, 0, 1, gone("courses", "lectures")), 3, "forward past the missing ones");
  assert.equal(nextIndex(list, 3, -1, gone("lectures", "courses")), 0, "back past the missing ones");
  assert.equal(nextIndex(list, list.length - 1, 1, () => true), null, "after the last one: the end");
  assert.equal(nextIndex(list, 2, 1, () => false), null, "everything gone: the end, not a stuck dialog");
  assert.equal(nextIndex(list, 0, -1, () => true), null, "no step before the first");
});

test("the bubble stays inside the screen", () => {
  const size = { w: 340, h: 200 };
  const view = { w: 1280, h: 800 };
  const boxes = [
    { top: 100, left: 40, width: 360, height: 540 },
    { top: 100, left: 880, width: 360, height: 540 },
    { top: 20, left: 900, width: 300, height: 70 },
    { top: 740, left: 100, width: 300, height: 50 },
    { top: -300, left: 0, width: 1280, height: 1600 },
  ];
  for (const b of boxes) {
    const p = placeBubble(b, size, view);
    assert.ok(p.top >= 0 && p.top + size.h <= view.h, `top ${p.top} for ${JSON.stringify(b)}`);
    assert.ok(p.left >= 0 && p.left + size.w <= view.w, `left ${p.left} for ${JSON.stringify(b)}`);
  }
  assert.equal(placeBubble(boxes[0], size, view).side, "right", "beside a tile");
  assert.equal(placeBubble(boxes[1], size, view).side, "left", "the last tile: on its other side");
  assert.equal(placeBubble(boxes[2], size, view).side, "below", "under something small");
});

test("scrolling never goes above the page, and a phone's bubble is left room", () => {
  assert.equal(scrollTopFor({ top: 10, left: 0, width: 300, height: 100 }, 0, 800, 0), 0);
  // the free part is 600 tall: a 200 tall element is centred in it
  assert.equal(scrollTopFor({ top: 1000, left: 0, width: 300, height: 200 }, 100, 800, 200), 900);
  // taller than the free part: its top is what counts
  assert.equal(scrollTopFor({ top: 1000, left: 0, width: 300, height: 700 }, 100, 800, 200), 1076);
});

const walk = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith(".tsx")) out.push(p);
  }
  return out;
};

test("every step has a marker on a real element", () => {
  const source = [...walk(path.join(repo, "app")), ...walk(path.join(repo, "components"))].map((f) => readFileSync(f, "utf8")).join("\n");
  for (const step of TOUR_STEPS) assert.ok(source.includes(`data-tour="${step}"`), `no data-tour="${step}"`);
});

test("the date step exists only while the date is missing: its marker sits on the alert that needs it", () => {
  const page = readFileSync(path.join(repo, "app/dashboard/page.tsx"), "utf8");
  assert.match(page, /\{profileIncomplete && \(\s*<div className="alert" data-tour="date">/);
});

test("every text exists in all three languages, labelled for /admin, without long hyphens", () => {
  const { byKey } = catalog();
  const en = baseDict("en").tour;
  for (const key of Object.keys(en)) {
    const entry = byKey.get(`tour.${key}`);
    assert.ok(entry, `tour.${key} is not in the admin pane`);
    assert.equal(entry.block, "dashboard");
    assert.ok(!entry.label.startsWith("tour"), `tour.${key} has no label of its own`);
  }
  for (const l of ["lv", "en", "ru"] as const) {
    const d = baseDict(l).tour;
    assert.deepEqual(Object.keys(d), Object.keys(en), `${l}: same keys`);
    for (const [k, v] of Object.entries(d)) {
      const text = typeof v === "function" ? (v as (a: number, b: number) => string)(1, 2) : String(v);
      assert.ok(text.trim(), `${l}.${k} is empty`);
      assert.ok(!/[–—]/.test(text), `${l}.${k} has a long hyphen`);
    }
  }
});

test("signed-out pages do not get the tour", () => {
  const footer = readFileSync(path.join(repo, "components/AppFooter.tsx"), "utf8");
  assert.match(footer, /\{signedIn && <li><Link href=\{TOUR_REOPEN_HREF\} prefetch=\{false\}>/, "the link is for signed-in people and is not fetched ahead");
  const importers = [...walk(path.join(repo, "app")), ...walk(path.join(repo, "components"))]
    .filter((f) => /from "[^"]*GuidedTour"/.test(readFileSync(f, "utf8")))
    .map((f) => path.relative(repo, f).split(path.sep).join("/"));
  assert.deepEqual(importers, ["app/dashboard/page.tsx"], "only the signed-in dashboard loads it");
});
