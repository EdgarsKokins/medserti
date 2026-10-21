/*
 * Certificate file previews in the browser: the hover card (first page) and the in-page viewer (all pages).
 * PDF pages are rendered to images with the pdf.js that unpdf bundles (the same one the scan OCR uses),
 * so nothing is framed: the file route stays frame-ancestors 'none'. Images are shown as they are.
 * Everything is cached per certificate for the page's lifetime; files come from /api/certificates/[id]/file.
 */

const MAX_PAGES = 30;

interface Loaded {
  type: string;
  bytes: Uint8Array;
}

const files = new Map<string, Promise<Loaded>>();
const firstPages = new Map<string, Promise<string>>();
const allPages = new Map<string, Promise<Rendered>>();

interface Rendered {
  urls: string[];
  /** pages in the file; more than urls.length when it was cut at MAX_PAGES */
  total: number;
}

export const fileUrl = (id: string) => `/api/certificates/${id}/file`;

function load(id: string): Promise<Loaded> {
  let p = files.get(id);
  if (!p) {
    p = fetch(fileUrl(id)).then(async (r) => {
      if (!r.ok) throw new Error(`file ${r.status}`);
      return { type: r.headers.get("content-type") ?? "", bytes: new Uint8Array(await r.arrayBuffer()) };
    });
    p.catch(() => files.delete(id)); // a failed load may be retried later
    files.set(id, p);
  }
  return p;
}

const asBlobUrl = (f: Loaded) => URL.createObjectURL(new Blob([f.bytes.slice()], { type: f.type }));

async function renderPages(f: Loaded, cssWidth: number, max: number): Promise<Rendered> {
  const { getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(f.bytes.slice());
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const urls: string[] = [];
  for (let p = 1; p <= Math.min(pdf.numPages, max); p++) {
    const page = await pdf.getPage(p);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: (cssWidth * ratio) / base.width });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
    if (blob) urls.push(URL.createObjectURL(blob));
  }
  return { urls, total: pdf.numPages };
}

/** Image URL of the first page, sized for the hover card */
export function firstPage(id: string, cssWidth = 360): Promise<string> {
  let p = firstPages.get(id);
  if (!p) {
    p = load(id).then(async (f) => (f.type === "application/pdf" ? (await renderPages(f, cssWidth, 1)).urls[0] : asBlobUrl(f)));
    p.catch(() => firstPages.delete(id));
    firstPages.set(id, p);
  }
  return p;
}

/** Image URLs of every page (up to MAX_PAGES), sized for the viewer */
export function pages(id: string, cssWidth = 820): Promise<Rendered> {
  let p = allPages.get(id);
  if (!p) {
    p = load(id).then((f) => (f.type === "application/pdf" ? renderPages(f, cssWidth, MAX_PAGES) : { urls: [asBlobUrl(f)], total: 1 }));
    p.catch(() => allPages.delete(id));
    allPages.set(id, p);
  }
  return p;
}

/** Hover previews only where a fine pointer can hover; phones and tablets tap straight to the viewer */
export const canHover = () => typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
