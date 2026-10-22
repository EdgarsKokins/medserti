/*
 * OCR for scanned PDFs and photos, without DOM or Node specifics: the caller supplies how to render a page,
 * rotate an image and run tesseract. The browser (uploadStore, pdfOcr) and the regression tests use the same steps.
 *
 * Orientation: phone photos and scans are often sideways or upside down, and tesseract reads turned text as noise,
 * so a weak first read is retried at 90, 270 and 180 degrees and the best read wins.
 * Language: the default model is Latvian + English. A Russian document read with it comes out as Latin letter soup
 * with capitals inside words ("HacTosmas cnpaska"); only then is the Russian model (~2.7 MB) loaded and tried.
 */

/** The browser OCRs a PDF whose text layer has fewer non-space characters than this (scans, image-only certificates) */
export const OCR_PDF_BELOW = 200;
/** Certificates are one page; programmes and bundles can be long, only the first pages matter */
export const OCR_MAX_PAGES = 2;
/** Long side of the rendered page in pixels: enough for tesseract, small enough for phones */
export const OCR_PAGE_PIXELS = 2200;

/** A page whose largest image covers this share of it is a scan, even with a text layer (scanner apps add a lossy one) */
export const SCAN_IMAGE_SHARE = 0.5;

/** pdf.js operator list, as returned by page.getOperatorList() */
export interface OpList {
  fnArray: number[];
  argsArray: unknown[];
}

/**
 * Share of the page (0-1) covered by its largest image, from a pdf.js operator list.
 * Images are painted into the unit square, so their area is the determinant of the current transform.
 */
export function largestImageShare(ops: OpList, OPS: Record<string, number>, pageArea: number): number {
  type M = [number, number, number, number, number, number];
  const mul = (m: M, n: M): M => [
    m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
  ];
  let ctm: M = [1, 0, 0, 1, 0, 0];
  const stack: M[] = [];
  let best = 0;
  const paints = new Set([OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject, OPS.paintJpegXObject, OPS.paintImageXObjectRepeat].filter((x) => x != null));
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    const args = ops.argsArray[i] as unknown[] | null;
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() ?? ctm;
    else if (fn === OPS.transform && args) ctm = mul(ctm, args.slice(0, 6) as M);
    else if (fn === OPS.paintFormXObjectBegin) {
      stack.push(ctm);
      const m = args?.[0] as M | null;
      if (Array.isArray(m) && m.length === 6) ctm = mul(ctm, m);
    } else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() ?? ctm;
    else if (paints.has(fn)) best = Math.max(best, Math.abs(ctm[0] * ctm[3] - ctm[1] * ctm[2]));
  }
  return pageArea > 0 ? Math.min(1, best / pageArea) : 0;
}

/** Should the browser OCR this PDF? Thin text layer, or the page is a scanned image */
export function pdfNeedsOcr(textLayerChars: number, imageShare: number): boolean {
  return textLayerChars < OCR_PDF_BELOW || imageShare >= SCAN_IMAGE_SHARE;
}

export interface OcrRead {
  text: string;
  /** tesseract mean confidence, 0-100 */
  confidence: number;
}

/** "lav": the default Latvian + English model; "rus": Russian + English, loaded only when a read looks Cyrillic */
export type OcrLang = "lav" | "rus";
export type Rotation = 0 | 90 | 180 | 270;

export interface OcrEngine<Img> {
  pageCount: number;
  render(page: number): Promise<Img>;
  rotate(img: Img, degrees: 90 | 180 | 270): Promise<Img>;
  recognize(img: Img, lang?: OcrLang): Promise<OcrRead>;
}

/** How much a read looks like words: share of tokens that are 3+ letter words */
export function readQuality(r: OcrRead): number {
  const tokens = r.text.split(/\s+/).filter(Boolean);
  if (!tokens.length) return 0;
  const words = tokens.filter((w) => /^[\p{L}][\p{L}'’.,:;-]{2,}$/u.test(w)).length;
  return (words / tokens.length) * 100 * 0.5 + r.confidence * 0.5;
}

/** A first read this good is kept without trying rotations */
const GOOD_ENOUGH = 62;

/**
 * Cyrillic read with the Latin model: words with a lowercase letter followed by a capital ("BbIaHa", "PecnyGanka").
 * On the real samples Russian letters score 0.23-0.28, every Latvian and English read 0.07 or less.
 */
export function looksMisreadCyrillic(text: string): boolean {
  const words = text.match(/[A-Za-z]{4,}/g) ?? [];
  if (words.length < 20) return false;
  const flipped = words.filter((w) => /[a-z][A-Z]/.test(w)).length;
  return flipped >= 6 && flipped / words.length >= 0.15;
}

/** Real Cyrillic text (the Russian model's read) */
export const hasCyrillic = (text: string) => (text.match(/[\u0400-\u04FF]/g) ?? []).length >= 20;

export interface PageRead extends OcrRead {
  rotation: Rotation;
  lang: OcrLang;
}

/**
 * Read one page the best way we can: as rendered, else turned (90, 270, 180), then in Russian if the best
 * Latin read is Cyrillic letter soup. `hint` is how the previous page read best, tried first.
 */
export async function readPage<Img>(engine: OcrEngine<Img>, img: Img, hint?: { rotation: Rotation; lang: OcrLang }): Promise<PageRead> {
  const turned = new Map<Rotation, Img>([[0, img]]);
  const turn = async (r: Rotation) => {
    if (!turned.has(r)) turned.set(r, await engine.rotate(img, r as 90 | 180 | 270));
    return turned.get(r)!;
  };
  const read = async (rotation: Rotation, lang: OcrLang): Promise<PageRead> => ({ ...(await engine.recognize(await turn(rotation), lang)), rotation, lang });

  let best = await read(hint?.rotation ?? 0, hint?.lang ?? "lav");
  if (readQuality(best) < GOOD_ENOUGH) {
    for (const rotation of [0, 90, 270, 180] as const) {
      if (rotation === best.rotation) continue;
      const r = await read(rotation, best.lang);
      if (readQuality(r) > readQuality(best)) best = r;
      if (readQuality(best) >= GOOD_ENOUGH) break;
    }
  }
  if (best.lang === "lav" && looksMisreadCyrillic(best.text)) {
    // the letter soup can look word-like, so judge by tesseract's own confidence (real letters: 44 Latin vs 69-72 Russian)
    const r = await read(best.rotation, "rus");
    if (hasCyrillic(r.text) && r.confidence >= best.confidence) best = r;
  }
  return best;
}

export interface OcrPdfResult {
  text: string;
  /** tesseract confidence of page 1's best read (0-100), for the "photo may be blurry" check */
  confidence: number;
  /** false when checkFirstPage asked to stop (the user chose another file) */
  completed: boolean;
  /** how page 1 read best: turned by this many degrees, with this model */
  rotation: Rotation;
  lang: OcrLang;
}

/**
 * OCR the first pages (a photo is a one-page document). `checkFirstPage` sees page 1 as rendered, before any OCR:
 * it can measure it and return false to stop (nothing is read then).
 */
export async function ocrPages<Img>(
  engine: OcrEngine<Img>,
  onPage?: (page: number, of: number) => void,
  checkFirstPage?: (img: Img) => Promise<boolean>,
): Promise<OcrPdfResult> {
  const pages = Math.min(engine.pageCount, OCR_MAX_PAGES);
  const out: string[] = [];
  let first: PageRead | null = null;
  for (let p = 1; p <= pages; p++) {
    onPage?.(p, pages);
    const img = await engine.render(p);
    if (p === 1 && checkFirstPage && !(await checkFirstPage(img))) return { text: "", confidence: 0, completed: false, rotation: 0, lang: "lav" };
    // later pages of a scan are usually turned the same way and in the same language as page 1
    const r: PageRead = await readPage(engine, img, first ?? undefined);
    first ??= r;
    out.push(r.text);
  }
  return { text: out.join("\n\n"), confidence: first?.confidence ?? 0, completed: true, rotation: first?.rotation ?? 0, lang: first?.lang ?? "lav" };
}
