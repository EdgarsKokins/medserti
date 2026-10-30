"use client";

import type { Worker as OcrWorker } from "tesseract.js";
import { FILE_TYPES, type CmeCertificate } from "@/lib/types";
import type { Dict } from "@/lib/i18n";
import { ocrPdfIfScanned } from "./pdfOcr";
import { canvasEngine, imageCanvas, type GetWorker } from "./ocrCanvas";
import { ocrPages, type OcrLang } from "@/lib/parse/ocr";
import { checkImageFile, checkRenderedPage } from "./imageCheck";
import type { QualityIssue } from "@/lib/parse/imageQuality";
import { classifyCertificate, uploadQuestion, type UploadQuestion } from "@/lib/parse/isCertificate";
import { reportError, reportFailure } from "@/components/monitoring/report";
import { trackEvent } from "@/components/monitoring/track";

/**
 * Upload queue that lives outside any page: it keeps running when the user moves from the dashboard to /certificates
 * (or anywhere else), and the certificates page picks up every certificate as it is stored, without a refresh.
 */

/** Vercel caps request bodies at ~4.5 MB; photos are downscaled in the browser to fit */
const MAX_BYTES = 4 * 1024 * 1024;
const MAX_IMAGE_INPUT_BYTES = 30 * 1024 * 1024;
const OK_TYPES = new Set<string>(FILE_TYPES);
export const ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp";

/** "check": the photo may be blurry, or the file may not be a certificate; waiting for the user's choice */
export type UploadState = "queued" | "check" | "reading" | "uploading" | "done" | "failed";
export interface UploadItem {
  key: string;
  name: string;
  state: UploadState;
  message: string | null;
  /** OCR progress 0-100 while reading an image */
  progress?: number;
  /** what the file is asked about ("check" state): photo quality, no text, or not a certificate */
  ask?: UploadQuestion;
}

export interface UploadSnapshot {
  items: UploadItem[];
  busy: boolean;
  /** certificates stored by the current or last batch, for a page that mounts mid-upload */
  stored: CmeCertificate[];
}

let snap: UploadSnapshot = { items: [], busy: false, stored: [] };
const listeners = new Set<() => void>();
const storedListeners = new Set<(certs: CmeCertificate[]) => void>();

const emit = (next: Partial<UploadSnapshot>) => {
  snap = { ...snap, ...next };
  listeners.forEach((l) => l());
};
const update = (key: string, patch: Partial<UploadItem>) =>
  emit({ items: snap.items.map((it) => (it.key === key ? { ...it, ...patch } : it)) });

export const getUploadSnapshot = () => snap;
const EMPTY: UploadSnapshot = { items: [], busy: false, stored: [] };
export const getServerUploadSnapshot = () => EMPTY;
export function subscribeUploads(l: () => void) {
  listeners.add(l);
  return () => void listeners.delete(l);
}
/** A certificate the user deleted: a page mounted later must not bring the queue's copy back */
export function forgetStored(id: string) {
  if (snap.stored.some((c) => c.id === id)) emit({ stored: snap.stored.filter((c) => c.id !== id) });
}
/** Called with each batch of certificates the server stored */
export function onCertificatesStored(l: (certs: CmeCertificate[]) => void) {
  storedListeners.add(l);
  return () => void storedListeners.delete(l);
}

// ---- the file checks (blurry photo, no text, not a certificate): a file that fails waits here for the user; never a hard block ----
type Choice = "upload" | "another" | "remove";
const waiting = new Map<string, (c: Choice) => void>();
/** The user's answer to the callout of one file ("another" and "remove" drop it; for "another" the area opens the picker) */
export function decideCheck(key: string, choice: Choice) {
  const resolve = waiting.get(key);
  if (!resolve) return;
  waiting.delete(key);
  resolve(choice);
}
function askUser(key: string, ask: UploadQuestion): Promise<Choice> {
  update(key, { state: "check", ask, progress: undefined });
  return new Promise((resolve) => waiting.set(key, resolve));
}
const dropItem = (key: string) => emit({ items: snap.items.filter((it) => it.key !== key) });

/** files picked while a batch runs ("Izvēlēties citu" mid-batch): uploaded right after it */
let pending: File[] = [];
/** the course of the files waiting in `pending` (picked from "Pievienot sertifikātu" on a course) */
let pendingCourse: string | null = null;

const isImage = (f: File) => f.type.startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(f.name);

/** Downscale a photo to max 2400px on the long side as JPEG, so it fits the upload limit */
async function shrinkImage(file: File): Promise<File> {
  if (file.size <= MAX_BYTES) return file;
  const bitmap = await createImageBitmap(file);
  for (const [side, quality] of [[2400, 0.85], [1800, 0.8], [1400, 0.75]] as const) {
    const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
    if (blob && blob.size <= MAX_BYTES) return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  }
  return file;
}

/** Start uploading; files picked while a batch runs wait for it. `courseId`: the course these certificates are for */
export async function startUpload(files: File[], d: Dict["upload"], courseId: string | null = null) {
  if (!files.length) return;
  if (snap.busy) {
    pending.push(...files);
    pendingCourse = courseId;
    return;
  }
  const stamp = Date.now();
  const batch = files.map((f, i) => ({
    file: f,
    item: { key: `${stamp}-${i}-${f.name}`, name: f.name, state: "queued" as UploadState, message: null },
  }));
  // a new batch replaces the finished rows of the last one, but keeps its failures and files still waiting for an answer
  const keep = (p: UploadItem) => p.state === "failed" || (p.state === "check" && waiting.has(p.key));
  emit({ items: [...batch.map((b) => b.item), ...snap.items.filter(keep)], busy: true, stored: [] });

  // OCR runs in the browser (free); workers are shared by the batch and loaded only when an image is present.
  // The Russian model (~2.7 MB) is downloaded only for a page whose Latvian read looks like Cyrillic (lib/parse/ocr.ts).
  const workers = new Map<OcrLang, Promise<OcrWorker>>();
  let currentKey = "";
  const getWorker: GetWorker = (lang = "lav") => {
    if (!workers.has(lang))
      workers.set(lang, import("tesseract.js").then(({ createWorker }) =>
        createWorker(lang === "rus" ? "rus+eng" : "lav+eng", 1, {
          logger: (m) => {
            if (m.status === "recognizing text" && currentKey) update(currentKey, { progress: Math.round(m.progress * 100) });
          },
        }),
      ));
    return workers.get(lang)!;
  };

  // One request per file: keeps each request small and shows per-file progress
  for (const { file, item } of batch) {
    if (file.size > (isImage(file) ? MAX_IMAGE_INPUT_BYTES : MAX_BYTES)) {
      update(item.key, { state: "failed", message: isImage(file) ? d.imageTooBig : d.pdfTooBig });
      continue;
    }
    if (file.type && !OK_TYPES.has(file.type)) {
      update(item.key, { state: "failed", message: d.onlyTypes });
      continue;
    }
    let ocrText = "";
    let ocrConfidence: number | null = null;
    // what the browser read (a PDF's text layer, or OCR), for the "is this a certificate?" check; null when reading failed
    let text: string | null = null;
    // the photo checks before OCR: measured first, asked about once the text is in (see uploadQuestion)
    let issues: QualityIssue[] = [];
    const flagged: QualityIssue[] = [];
    const content = null;
    const isPdf = !isImage(file) && (file.type === "application/pdf" || /\.pdf$/i.test(file.name));
    if (isPdf) {
      // scanned PDFs have no usable text layer: read them like photos, with the same check on page 1
      currentKey = item.key;
      try {
        const r = await ocrPdfIfScanned(
          file,
          getWorker,
          () => update(item.key, { state: "reading", progress: 0 }),
          async (page) => {
            issues = checkRenderedPage(page);
            return true;
          },
        );
        if (r.ocr) {
          ocrText = r.ocr.text;
          ocrConfidence = r.ocr.confidence;
        }
        text = r.ocr ? r.ocr.text : r.layer;
      } catch (err) {
        console.error("PDF OCR failed", err); // upload anyway; the server reads the text layer or asks for manual entry
      }
      currentKey = "";
    } else if (isImage(file)) {
      issues = await checkImageFile(file);
      update(item.key, { state: "reading", progress: 0 });
      currentKey = item.key;
      try {
        // a photo is a one-page document: same orientation and language steps as a scanned PDF
        const page = await imageCanvas(file);
        const r = await ocrPages<HTMLCanvasElement>({ pageCount: 1, render: async () => page, ...canvasEngine(getWorker) });
        ocrText = r.text;
        ocrConfidence = r.confidence;
        text = r.text;
      } catch (err) {
        console.error("OCR failed", err); // upload anyway; the user enters the details
      }
      currentKey = "";
    }
    // one question per file: photo quality, no text, or not a certificate, in the order of lib/parse/isCertificate.ts.
    // The file waits for the answer on its own; the rest of the batch keeps going.
    if (text != null) {
      const ask = uploadQuestion({ check: classifyCertificate(text, null, ocrConfidence), issues, ocrConfidence, text });
      if (ask) {
        const sent = { ocrText, ocrConfidence, courseId };
        void askUser(item.key, ask).then((choice) => {
          if (choice !== "upload") return dropItem(item.key);
          const checked = ask.kind === "quality" ? { flagged: ask.issues, content: null } : { flagged: [], content: ask.kind };
          return inTurn(() => send(file, item.key, { ...sent, ...checked }, d));
        });
        continue;
      }
    }
    await inTurn(() => send(file, item.key, { ocrText, ocrConfidence, flagged, content, courseId }, d));
  }
  for (const w of workers.values()) await w.then((x) => x.terminate()).catch(() => {});
  emit({ busy: false });
  // files the user picked meanwhile (a retaken photo): start them now
  if (pending.length) {
    const [next, course] = [pending, pendingCourse];
    pending = [];
    pendingCourse = null;
    void startUpload(next, d, course);
  }
}

/** Uploads go out one at a time, also when a checked file is let through while the batch is still running */
let turn: Promise<void> = Promise.resolve();
function inTurn(fn: () => Promise<void>) {
  const run = turn.then(fn);
  turn = run.catch(() => {});
  return run;
}

interface Extras {
  ocrText: string;
  ocrConfidence: number | null;
  /** photo issues the user uploaded anyway; the server notes them on the certificate */
  flagged: QualityIssue[];
  content: "noText" | "notCertificate" | null;
  /** the Medserti course this certificate is for; the server fills empty fields from it */
  courseId: string | null;
}

async function send(file: File, key: string, { ocrText, ocrConfidence, flagged, content, courseId }: Extras, d: Dict["upload"]) {
  update(key, { state: "uploading", progress: undefined, ask: undefined });
  try {
    const upload = isImage(file) ? await shrinkImage(file).catch(() => file) : file;
    if (upload.size > MAX_BYTES) {
      update(key, { state: "failed", message: d.tooLargeToUpload });
      return;
    }
    const body = new FormData();
    body.append("files", upload);
    if (ocrText) body.append("ocrText", ocrText);
    if (ocrConfidence != null) body.append("ocrConfidence", String(Math.round(ocrConfidence)));
    if (flagged.length) body.append("imageQuality", flagged.join(","));
    if (content) body.append("contentCheck", content);
    if (courseId) body.append("courseId", courseId);
    const res = await fetch("/api/certificates", { method: "POST", body });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      reportFailure("certUpload", res);
      update(key, { state: "failed", message: data.error ?? d.uploadFailed(res.status) });
      return;
    }
    const certs: CmeCertificate[] = data.certificates ?? [];
    if (data.first) trackEvent("First certificate uploaded");
    emit({ stored: [...snap.stored, ...certs] });
    storedListeners.forEach((l) => l(certs));
    const unread = certs.find((c) => !c.title && c.points == null);
    update(key, { state: "done", message: unread ? d.notRead : d.checkBelow });
  } catch (err) {
    reportFailure("certUpload", null);
    if (!(err instanceof TypeError)) reportError({ source: "client", message: err instanceof Error ? err.message : err, stack: err instanceof Error ? err.stack : undefined });
    update(key, { state: "failed", message: d.network });
  }
}
