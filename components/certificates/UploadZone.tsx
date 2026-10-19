"use client";

import { useRef, useState } from "react";
import type { Worker as OcrWorker } from "tesseract.js";
import type { CmeCertificate } from "@/lib/types";
import { t, type Locale } from "@/lib/i18n";
import styles from "./certificates.module.css";

/** Vercel caps request bodies at ~4.5 MB; photos are downscaled in the browser to fit */
const MAX_BYTES = 4 * 1024 * 1024;
const MAX_IMAGE_INPUT_BYTES = 30 * 1024 * 1024;

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
const ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp";
const OK_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

type UploadState = "queued" | "reading" | "uploading" | "done" | "failed";
interface UploadItem {
  key: string;
  name: string;
  state: UploadState;
  message: string | null;
  /** OCR progress 0-100 while reading an image */
  progress?: number;
}

const isImage = (f: File) => f.type.startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(f.name);

const STATE_CLASS: Record<UploadState, string> = {
  queued: "badge",
  reading: "badge",
  uploading: "badge",
  done: "badge badge-ok",
  failed: "badge badge-bad",
};

export default function UploadZone({
  onUploaded,
  locale,
}: {
  onUploaded: (certs: CmeCertificate[]) => void;
  locale: Locale;
}) {
  const d = t(locale).upload;
  const input = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);

  const update = (key: string, patch: Partial<UploadItem>) =>
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));

  async function handle(fileList: FileList | null) {
    if (!fileList?.length || busy) return;
    const files = Array.from(fileList);
    const batch = files.map((f, i) => ({
      file: f,
      item: { key: `${Date.now()}-${i}-${f.name}`, name: f.name, state: "queued" as UploadState, message: null },
    }));
    setItems((prev) => [...batch.map((b) => b.item), ...prev.filter((p) => p.state !== "done")]);
    setBusy(true);

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
      if (isImage(file)) {
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
        onUploaded(certs);
        const unread = certs.find((c) => !c.title && c.points == null);
        update(item.key, { state: "done", message: unread ? d.notRead : d.checkBelow });
      } catch {
        update(item.key, { state: "failed", message: d.network });
      }
    }
    if (worker) await (worker as OcrWorker).terminate().catch(() => {});
    setBusy(false);
    if (input.current) input.current.value = "";
  }

  return (
    <div className="card stack">
      <div
        className={`${styles.drop} ${over ? styles.dropActive : ""}`}
        role="button"
        tabIndex={0}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            input.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          handle(e.dataTransfer.files);
        }}
      >
        <strong>{d.drop}</strong>
        <div className="small muted">{d.hint}</div>
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          multiple
          hidden
          onChange={(e) => handle(e.target.files)}
        />
      </div>
      {items.length > 0 && (
        <ul className={styles.uploads}>
          {items.map((it) => (
            <li key={it.key}>
              <span className={styles.uploadName}>{it.name}</span>
              <span className="row">
                {it.message && <span className="small muted">{it.message}</span>}
                <span className={STATE_CLASS[it.state]}>
                  {d.states[it.state]}
                  {it.state === "reading" && it.progress ? ` ${it.progress}%` : ""}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
