/*
 * Is a photo (or a scanned PDF page) good enough to read? Two checks, free and in the browser:
 *   before OCR: sharpness (variance of the Laplacian), brightness and resolution of the image;
 *   after OCR:  tesseract's mean confidence and how much text it found.
 * Pure functions on greyscale pixels: the browser (components/certificates/imageCheck.ts) and the
 * calibration over the real Drive samples run the same code. A failed check never blocks: the user
 * is told the photo may be blurry and can upload anyway.
 *
 * Thresholds were calibrated on 41 real scans and photos (Oct 2026): none that we read correctly is
 * flagged, while blurred, shaky, dark, overexposed and tiny copies of them are. See the PR for the table.
 */

/** The image is measured at this long side, so phone photos and PDF renders score on the same scale */
export const QUALITY_SIDE = 1000;

/** Variance of the Laplacian below this: blurry or shaken (good samples >= 2320, blurred/shaky copies <= 280) */
export const MIN_SHARPNESS = 500;
/**
 * Light is judged on percentiles, not the mean (a white certificate on white paper averages ~245):
 * the brightest 1% (the paper) darker than MIN_PAPER = too dark; the darkest 0.1% (the ink) lighter than MAX_INK = washed out
 */
export const MIN_PAPER = 110;
export const MAX_INK = 170;
/** Long side of the original image below this (px): too small to read */
export const MIN_LONG_SIDE = 700;
/** Tesseract mean confidence (0-100) below this (good samples >= 57), or fewer letters than MIN_OCR_LETTERS (good >= 186) */
export const MIN_OCR_CONFIDENCE = 50;
export const MIN_OCR_LETTERS = 100;

/** screen: a photo of a computer or phone screen (found in the OCR text, lib/parse/isCertificate.ts screenPhoto) */
export type QualityIssue = "blurry" | "dark" | "bright" | "small" | "unreadable" | "screen";

export interface ImageMeasure {
  sharpness: number;
  brightness: number;
  /** darkest 0.1% of pixels (the ink: a sparse certificate has little of it) and brightest 1% (the paper), 0-255 */
  ink: number;
  paper: number;
  /** long side of the original, before downscaling */
  longSide: number;
}

/** Greyscale (luma) from RGBA pixels */
export function toGray(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): Float32Array {
  const g = new Float32Array(width * height);
  for (let i = 0, p = 0; i < g.length; i++, p += 4) g[i] = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2];
  return g;
}

/** Variance of the 4-neighbour Laplacian and the mean brightness of a greyscale image */
export function measureGray(gray: Float32Array, width: number, height: number, longSide: number): ImageMeasure {
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  let bright = 0;
  const hist = new Uint32Array(256);
  for (let i = 0; i < gray.length; i++) {
    bright += gray[i];
    hist[Math.max(0, Math.min(255, Math.round(gray[i])))]++;
  }
  const percentile = (q: number) => {
    const target = q * gray.length;
    let acc = 0;
    for (let v = 0; v < 256; v++) if ((acc += hist[v]) >= target) return v;
    return 255;
  };
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const lap = gray[i - 1] + gray[i + 1] + gray[i - width] + gray[i + width] - 4 * gray[i];
      sum += lap;
      sumSq += lap * lap;
      n++;
    }
  }
  const mean = n ? sum / n : 0;
  return {
    sharpness: n ? sumSq / n - mean * mean : 0,
    brightness: gray.length ? bright / gray.length : 0,
    ink: percentile(0.001),
    paper: percentile(0.99),
    longSide,
  };
}

/** What is wrong with an image before OCR; empty when it looks fine */
export function imageIssues(m: ImageMeasure): QualityIssue[] {
  const out: QualityIssue[] = [];
  if (m.longSide < MIN_LONG_SIDE) out.push("small");
  if (m.paper < MIN_PAPER) out.push("dark");
  else if (m.ink > MAX_INK) out.push("bright");
  if (m.sharpness < MIN_SHARPNESS) out.push("blurry");
  return out;
}

/** Did OCR fail to read the page? Low mean confidence, or almost no letters */
export function ocrUnreadable(confidence: number, text: string): boolean {
  const letters = (text.match(/\p{L}/gu) ?? []).length;
  return confidence < MIN_OCR_CONFIDENCE || letters < MIN_OCR_LETTERS;
}

/** Size for the downscaled copy that is measured */
export function qualitySize(width: number, height: number): { width: number; height: number } {
  const s = Math.min(1, QUALITY_SIDE / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * s)), height: Math.max(1, Math.round(height * s)) };
}
