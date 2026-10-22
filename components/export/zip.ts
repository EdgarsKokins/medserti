import type JSZip from "jszip";
import { stripMarks } from "@/lib/text";

/** ASCII-safe file name part for the ZIP */
export const slug = (x: string) =>
  stripMarks(x).replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 50) || "sertifikats";

export const extOf = (fileName: string) => (fileName.match(/\.[a-z0-9]+$/i)?.[0] ?? ".pdf").toLowerCase();

/** Fetch the user's own certificate files into `dir`, oldest first; returns how many failed */
export async function addCertificateFiles(
  zip: JSZip,
  dir: string,
  rows: { id: string; date: string; title: string; fileName: string }[],
  onProgress: (done: number) => void,
): Promise<number> {
  let failed = 0;
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i];
    try {
      const res = await fetch(`/api/certificates/${encodeURIComponent(r.id)}/file`);
      if (!res.ok) throw new Error(String(res.status));
      zip.file(`${dir}/${String(i + 1).padStart(2, "0")}_${r.date}_${slug(r.title)}${extOf(r.fileName)}`, await res.blob());
    } catch {
      failed++;
    }
    onProgress(i + 1);
  }
  return failed;
}

export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
