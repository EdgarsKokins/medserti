/*
 * OCR for scanned PDFs, without DOM or Node specifics: the caller supplies how to render a page,
 * rotate an image and run tesseract. The browser (UploadZone) and the regression tests use the same steps.
 *
 * Phone scans are often sideways (landscape certificates), and tesseract reads sideways text as noise,
 * so a weak first read is retried at 90 and 270 degrees and the best read wins.
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

export interface OcrEngine<Img> {
  pageCount: number;
  render(page: number): Promise<Img>;
  rotate(img: Img, degrees: 90 | 270): Promise<Img>;
  recognize(img: Img): Promise<OcrRead>;
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

export interface OcrPdfResult {
  text: string;
  /** tesseract confidence of page 1's best read (0-100), for the "photo may be blurry" check */
  confidence: number;
  /** false when checkFirstPage asked to stop (the user chose another file) */
  completed: boolean;
}

/**
 * OCR the first pages. `checkFirstPage` sees page 1 as rendered, before any OCR: it can measure it and
 * return false to stop (nothing is read then).
 */
export async function ocrPdfPages<Img>(
  engine: OcrEngine<Img>,
  onPage?: (page: number, of: number) => void,
  checkFirstPage?: (img: Img) => Promise<boolean>,
): Promise<OcrPdfResult> {
  const pages = Math.min(engine.pageCount, OCR_MAX_PAGES);
  const out: string[] = [];
  let confidence = 0;
  for (let p = 1; p <= pages; p++) {
    onPage?.(p, pages);
    const img = await engine.render(p);
    if (p === 1 && checkFirstPage && !(await checkFirstPage(img))) return { text: "", confidence: 0, completed: false };
    let best = await engine.recognize(img);
    if (readQuality(best) < GOOD_ENOUGH) {
      for (const deg of [90, 270] as const) {
        const r = await engine.recognize(await engine.rotate(img, deg));
        if (readQuality(r) > readQuality(best)) best = r;
        if (readQuality(best) >= GOOD_ENOUGH) break;
      }
    }
    if (p === 1) confidence = best.confidence;
    out.push(best.text);
  }
  return { text: out.join("\n\n"), confidence, completed: true };
}
