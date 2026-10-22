import { largestImageShare, OCR_PAGE_PIXELS, ocrPages, pdfNeedsOcr, type OcrPdfResult } from "@/lib/parse/ocr";
import { canvasEngine, type GetWorker } from "./ocrCanvas";

/**
 * Browser side of reading scanned PDFs: when a PDF's text layer is thin or its page is a scanned image,
 * render the pages and OCR them with the shared tesseract workers. Returns null when the text layer is enough,
 * so the server reads that as before. Steps shared with the tests live in lib/parse/ocr.ts.
 * `checkFirstPage` sees page 1 as rendered, before OCR (the blurry-photo check); returning false stops.
 */
export async function ocrPdfIfScanned(
  file: File,
  getWorker: GetWorker,
  onStart: () => void,
  checkFirstPage?: (page: HTMLCanvasElement) => Promise<boolean>,
): Promise<OcrPdfResult | null> {
  const { extractText, getDocumentProxy, getResolvedPDFJS } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
  const { OPS } = await getResolvedPDFJS();
  const { text } = await extractText(pdf, { mergePages: true });
  const first = await pdf.getPage(1);
  const [x0, y0, x1, y1] = first.view;
  const share = largestImageShare(await first.getOperatorList(), OPS as unknown as Record<string, number>, (x1 - x0) * (y1 - y0));
  if (!pdfNeedsOcr(text.replace(/\s/g, "").length, share)) return null;

  onStart();
  return ocrPages<HTMLCanvasElement>({
    pageCount: pdf.numPages,
    async render(p) {
      const page = await pdf.getPage(p);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: OCR_PAGE_PIXELS / Math.max(base.width, base.height) });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      return canvas;
    },
    ...canvasEngine(getWorker),
  }, undefined, checkFirstPage);
}
