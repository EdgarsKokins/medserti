import type { Worker as OcrWorker } from "tesseract.js";
import type { OcrEngine, OcrLang } from "@/lib/parse/ocr";

/** Gets the tesseract worker for a model; the Russian one is created only when a page asks for it */
export type GetWorker = (lang?: OcrLang) => Promise<OcrWorker>;

/** A canvas turned clockwise by 90, 180 or 270 degrees */
export function rotateCanvas(img: HTMLCanvasElement, degrees: 90 | 180 | 270): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const swap = degrees !== 180;
  canvas.width = swap ? img.height : img.width;
  canvas.height = swap ? img.width : img.height;
  const ctx = canvas.getContext("2d")!;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((degrees * Math.PI) / 180);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
  return canvas;
}

/** The canvas side of an OcrEngine (lib/parse/ocr.ts): rotation and recognition with the right worker */
export function canvasEngine(getWorker: GetWorker): Pick<OcrEngine<HTMLCanvasElement>, "rotate" | "recognize"> {
  return {
    rotate: async (img, degrees) => rotateCanvas(img, degrees),
    async recognize(img, lang) {
      const { data } = await (await getWorker(lang)).recognize(img);
      return { text: data.text, confidence: data.confidence };
    },
  };
}

/** Long side of a photo for OCR: a phone photo of an A4 page stays readable, and turning it four ways stays quick */
const PHOTO_PIXELS = 3000;

/** A photo drawn onto white paper (a transparent PNG would read as black), as a one-page document */
export async function imageCanvas(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, PHOTO_PIXELS / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}
