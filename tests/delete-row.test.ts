// Deleting a row of the certificate list (components/certificates/leave.ts): where focus goes and how the
// request and the animation meet. Fictional row ids only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CARD_ROOM, FADE_MS, LEAVE_MS, nextFocusId, settle, stripHeight, type Section } from "../components/certificates/leave";

const page = (main: string[], confirmed: string[] = [], confirmedOpen = false, past: string[] = [], pastOpen = false): Section[] => [
  { ids: main, open: true },
  { ids: confirmed, open: confirmedOpen },
  { ids: past, open: pastOpen },
];

test("focus: the next row, else the one before", () => {
  const p = page(["a", "b", "c"]);
  assert.equal(nextFocusId(p, page(["b", "c"]), "a"), "b");
  assert.equal(nextFocusId(p, page(["a", "c"]), "b"), "c");
  assert.equal(nextFocusId(p, page(["a", "b"]), "c"), "b");
});

test("focus: nothing left gives null (the list heading takes it)", () => {
  assert.equal(nextFocusId(page(["a"]), page([]), "a"), null);
});

test("focus: rows in a folded group are skipped", () => {
  // two waiting rows, the confirmed ones folded away: deleting the last waiting row goes back to the one before
  assert.equal(nextFocusId(page(["w1", "w2"], ["c1", "c2"]), page(["w1"], ["c1", "c2"]), "w2"), "w1");
  // the group is open: the next row is the first confirmed one
  assert.equal(nextFocusId(page(["w1", "w2"], ["c1"], true), page(["w1"], ["c1"], true), "w2"), "c1");
});

test("focus: the last waiting row gone, the confirmed rows unfold and the first of them takes focus", () => {
  // before: one waiting row, two folded confirmed rows; after: no group, all in the main list
  assert.equal(nextFocusId(page(["w1"], ["c1", "c2"]), page(["c1", "c2"]), "w1"), "c1");
});

test("focus: a row in the past periods list", () => {
  assert.equal(nextFocusId(page(["a"], [], false, ["p1", "p2"], true), page(["a"], [], false, ["p2"], true), "p1"), "p2");
  assert.equal(nextFocusId(page(["a"], [], false, ["p1"], true), page(["a"], [], false, [], true), "p1"), "a");
});

test("focus: rows already leaving are not targets", () => {
  // the caller leaves rows already on their way out out of both pictures
  assert.equal(nextFocusId(page(["a", "c"]), page(["a"]), "c"), "a");
});

const later = <T,>(ms: number, v: T) => new Promise<T>((r) => setTimeout(() => r(v), ms));

test("settle: a failed request answers at once, without waiting for the animation", async () => {
  const t0 = Date.now();
  assert.equal(await settle(later(5, false), later(200, undefined)), "failed");
  assert.ok(Date.now() - t0 < 150, "the row comes back as soon as the request fails");
});

test("settle: a successful request waits until the animation has played", async () => {
  let played = false;
  const anim = later(60, undefined).then(() => void (played = true));
  assert.equal(await settle(later(5, true), anim), "deleted");
  assert.ok(played);
});

test("settle: a slow request is not cut short by the animation", async () => {
  let answered = false;
  const req = later(80, true).then((v) => ((answered = true), v));
  assert.equal(await settle(req, later(5, undefined)), "deleted");
  assert.ok(answered);
});

test("strip: a tall row shrinks to the bin and room for the card; a short one stays", () => {
  // phone: 192px row, bin centred 160px down: 32px below the centre plus the room above it
  assert.equal(stripHeight(192, 160), 32 + CARD_ROOM);
  // desktop: a 76px row with the bin in the middle stays as it is
  assert.equal(stripHeight(76, 38), 76);
  assert.equal(stripHeight(60, 30), 60);
});

test("timing stays short", () => {
  assert.ok(LEAVE_MS >= 450 && LEAVE_MS <= 600);
  assert.ok(FADE_MS <= LEAVE_MS);
});
