import { imageIssues, measureGray, qualitySize, toGray, type QualityIssue } from "@/lib/parse/imageQuality";

/**
 * Browser side of the "photo may be blurry" check (lib/parse/imageQuality.ts): draw the image or the rendered
 * PDF page onto a small canvas and measure it. Fast (a 1000 px greyscale pass), runs before OCR.
 */

function measureSource(src: CanvasImageSource, width: number, height: number, longSide: number): QualityIssue[] {
  const s = qualitySize(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = s.width;
  canvas.height = s.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  // a transparent PNG would read as black: put it on white paper first
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, s.width, s.height);
  ctx.drawImage(src, 0, 0, s.width, s.height);
  const data = ctx.getImageData(0, 0, s.width, s.height).data;
  return imageIssues(measureGray(toGray(data, s.width, s.height), s.width, s.height, longSide));
}

/** Issues of a photo the user picked or took; [] when it cannot be decoded (OCR and the server decide then) */
export async function checkImageFile(file: File): Promise<QualityIssue[]> {
  try {
    const bitmap = await createImageBitmap(file);
    const issues = measureSource(bitmap, bitmap.width, bitmap.height, Math.max(bitmap.width, bitmap.height));
    bitmap.close();
    return issues;
  } catch {
    return [];
  }
}

/** Issues of a rendered PDF page. Its size is our render size, not the scan's, so "small" is not judged here. */
export function checkRenderedPage(canvas: HTMLCanvasElement): QualityIssue[] {
  return measureSource(canvas, canvas.width, canvas.height, Number.MAX_SAFE_INTEGER).filter((i) => i !== "small");
}
