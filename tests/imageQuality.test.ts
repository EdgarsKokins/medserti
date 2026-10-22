/* Blurry-photo check (lib/parse/imageQuality.ts) on synthetic greyscale pages. Run with: npm test
 * The thresholds themselves were calibrated on real scans outside the repo (they hold personal data); these tests
 * pin the behaviour: a sharp page passes, blurred / shaken / dark / washed-out / tiny copies are flagged. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { imageIssues, measureGray, MIN_OCR_LETTERS, ocrUnreadable, qualitySize } from "@/lib/parse/imageQuality";

const W = 1000;
const H = 1400;

/** A white page with rows of dark "text" strokes, like a certificate at the measured size */
function page(): Float32Array {
  const g = new Float32Array(W * H).fill(245);
  for (let row = 120; row < H - 120; row += 46) {
    for (let x = 80; x < W - 80; x++) {
      // words of 3-9 px wide strokes with gaps, 18 px tall
      if ((x % 60) > 48 || (x % 7) > 3) continue;
      for (let y = row; y < row + 18; y++) g[y * W + x] = 25;
    }
  }
  return g;
}

function boxBlur(g: Float32Array, r: number, passes = 3): Float32Array {
  let a = g.slice();
  const b = new Float32Array(g.length);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += a[y * W + Math.min(W - 1, Math.max(0, x + k))];
      b[y * W + x] = s / (2 * r + 1);
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += b[Math.min(H - 1, Math.max(0, y + k)) * W + x];
      a[y * W + x] = s / (2 * r + 1);
    }
  }
  return a;
}

/** Hand shake: a smear along a slightly diagonal path (as in the calibration copies) */
function motion(g: Float32Array, len: number): Float32Array {
  const out = new Float32Array(g.length);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let s = 0;
    for (let k = 0; k < len; k++) s += g[Math.min(H - 1, y + (k >> 2)) * W + Math.min(W - 1, x + k)];
    out[y * W + x] = s / len;
  }
  return out;
}

const issues = (g: Float32Array, longSide = 2200) => imageIssues(measureGray(g, W, H, longSide));

test("a sharp, well-lit page passes", () => {
  assert.deepEqual(issues(page()), []);
});

test("blurred and shaken copies are flagged as blurry", () => {
  assert.ok(issues(boxBlur(page(), 2)).includes("blurry"));
  assert.ok(issues(boxBlur(page(), 4)).includes("blurry"));
  assert.ok(issues(motion(page(), 18)).includes("blurry"));
});

test("too dark and washed-out copies are flagged", () => {
  assert.ok(issues(page().map((v) => v * 0.18)).includes("dark"));
  assert.ok(issues(page().map((v) => 255 - (255 - v) * 0.12)).includes("bright"));
});

test("a photo too small to read is flagged; size is the original's long side", () => {
  assert.ok(issues(page(), 500).includes("small"));
  assert.ok(!issues(page(), 1600).includes("small"));
});

test("measured size: long side capped at 1000 px, never upscaled", () => {
  assert.deepEqual(qualitySize(4000, 3000), { width: 1000, height: 750 });
  assert.deepEqual(qualitySize(600, 800), { width: 600, height: 800 });
});

test("after OCR: low confidence or almost no letters means unreadable", () => {
  const text = "Sertifikāts apliecina dalību konferencē ".repeat(5);
  assert.equal(ocrUnreadable(80, text), false);
  assert.equal(ocrUnreadable(40, text), true);
  assert.equal(ocrUnreadable(90, "x".repeat(MIN_OCR_LETTERS - 1)), true);
});
