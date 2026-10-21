"use client";

import type { Worker as OcrWorker } from "tesseract.js";
import type { CmeCertificate } from "@/lib/types";
import type { Dict } from "@/lib/i18n";
import { ocrPdfIfScanned } from "./pdfOcr";

/**
 * Upload queue that lives outside any page: it keeps running when the user moves from the dashboard to /certificates
 * (or anywhere else), and the certificates page picks up every certificate as it is stored, without a refresh.
 */

/** Vercel caps request bodies at ~4.5 MB; photos are downscaled in the browser to fit */
const MAX_BYTES = 4 * 1024 * 1024;
const MAX_IMAGE_INPUT_BYTES = 30 * 1024 * 1024;
const OK_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
export const ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp";

export type UploadState = "queued" | "reading" | "uploading" | "done" | "failed";
export interface UploadItem {
  key: string;
  name: string;
  state: UploadState;
  message: string | null;
  /** OCR progress 0-100 while reading an image */
  progress?: number;
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
/** Called with each batch of certificates the server stored */
export function onCertificatesStored(l: (certs: CmeCertificate[]) => void) {
  storedListeners.add(l);
  return () => void storedListeners.delete(l);
}

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

/** Start uploading; ignored while a batch is running (the pickers are disabled then) */
export async function startUpload(files: File[], d: Dict["upload"]) {
  if (!files.length || snap.busy) return;
  const stamp = Date.now();
  const batch = files.map((f, i) => ({
    file: f,
    item: { key: `${stamp}-${i}-${f.name}`, name: f.name, state: "queued" as UploadState, message: null },
  }));
  // a new batch replaces the finished rows of the last one, but keeps its failures in view
  emit({ items: [...batch.map((b) => b.item), ...snap.items.filter((p) => p.state === "failed")], busy: true, stored: [] });

  // OCR runs in the browser (free); one worker is shared by the batch and loaded only when an image is present
  let worker: OcrWorker | null = null;
  let currentKey = "";
  const getWorker = async () => {
    if (worker) return worker;
    const { createWorker } = await import("tesseract.js");
    worker = await createWorker("lav+eng", 1, {
      logger: (m) => {
        if (m.status === "recognizing text" && currentKey) update(currentKey, { progress: Math.round(m.progress * 100) });
      },
    });
    return worker;
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
    const isPdf = !isImage(file) && (file.type === "application/pdf" || /\.pdf$/i.test(file.name));
    if (isPdf) {
      // scanned PDFs have no usable text layer: read them like photos
      currentKey = item.key;
      try {
        ocrText = await ocrPdfIfScanned(file, getWorker, () => update(item.key, { state: "reading", progress: 0 }));
      } catch (err) {
        console.error("PDF OCR failed", err); // upload anyway; the server reads the text layer or asks for manual entry
      }
      currentKey = "";
    } else if (isImage(file)) {
      update(item.key, { state: "reading", progress: 0 });
      currentKey = item.key;
      try {
        const w = await getWorker();
        ocrText = (await w.recognize(file)).data.text;
      } catch (err) {
        console.error("OCR failed", err); // upload anyway; the user enters the details
      }
      currentKey = "";
    }
    update(item.key, { state: "uploading", progress: undefined });
    try {
      const upload = isImage(file) ? await shrinkImage(file).catch(() => file) : file;
      if (upload.size > MAX_BYTES) {
        update(item.key, { state: "failed", message: d.tooLargeToUpload });
        continue;
      }
      const body = new FormData();
      body.append("files", upload);
      if (ocrText) body.append("ocrText", ocrText);
      const res = await fetch("/api/certificates", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        update(item.key, { state: "failed", message: data.error ?? d.uploadFailed(res.status) });
        continue;
      }
      const certs: CmeCertificate[] = data.certificates ?? [];
      emit({ stored: [...snap.stored, ...certs] });
      storedListeners.forEach((l) => l(certs));
      const unread = certs.find((c) => !c.title && c.points == null);
      update(item.key, { state: "done", message: unread ? d.notRead : d.checkBelow });
    } catch {
      update(item.key, { state: "failed", message: d.network });
    }
  }
  if (worker) await (worker as OcrWorker).terminate().catch(() => {});
  emit({ busy: false });
}
