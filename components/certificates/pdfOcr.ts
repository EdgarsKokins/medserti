import type { Worker as OcrWorker } from "tesseract.js";
import { largestImageShare, OCR_PAGE_PIXELS, ocrPdfPages, pdfNeedsOcr } from "@/lib/parse/ocr";

/**
 * Browser side of reading scanned PDFs: when a PDF's text layer is thin or its page is a scanned image,
 * render the pages and OCR them with the shared tesseract worker. Returns "" when the text layer is enough,
 * so the server reads that as before. Steps shared with the tests live in lib/parse/ocr.ts.
 */
export async function ocrPdfIfScanned(
  file: File,
  getWorker: () => Promise<OcrWorker>,
  onStart: () => void,
): Promise<string> {
  const { extractText, getDocumentProxy, getResolvedPDFJS } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
  const { OPS } = await getResolvedPDFJS();
  const { text } = await extractText(pdf, { mergePages: true });
  const first = await pdf.getPage(1);
  const [x0, y0, x1, y1] = first.view;
  const share = largestImageShare(await first.getOperatorList(), OPS as unknown as Record<string, number>, (x1 - x0) * (y1 - y0));
  if (!pdfNeedsOcr(text.replace(/\s/g, "").length, share)) return "";

  onStart();
  const worker = await getWorker();
  return ocrPdfPages<HTMLCanvasElement>({
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
    async rotate(img, degrees) {
      const canvas = document.createElement("canvas");
      canvas.width = img.height;
      canvas.height = img.width;
      const ctx = canvas.getContext("2d")!;
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((degrees * Math.PI) / 180);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      return canvas;
    },
    async recognize(img) {
      const { data } = await worker.recognize(img);
      return { text: data.text, confidence: data.confidence };
    },
  });
}
