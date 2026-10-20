import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { currentUser } from "@/lib/auth";
import { listCertificates, saveCertificate } from "@/lib/db";
import { putBytes } from "@/lib/storage";
import { EMPTY_FIELDS, parseCertificate } from "@/lib/parse";
import type { CmeCertificate } from "@/lib/types";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";

export const maxDuration = 60;

const MAX_BYTES = 4.5 * 1024 * 1024; // Vercel request body limit
const MAX_OCR_CHARS = 50_000;
const EXT: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** Detect the real type from the first bytes; the browser-supplied type is not trusted */
function sniffType(b: Buffer): string | null {
  if (b.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  return null;
}

function sanitizeName(name: string, type: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const stem = base
    .replace(/\.[^.]*$/, "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^[._]+|_+$/g, "")
    .slice(0, 80);
  return `${stem || "certificate"}.${EXT[type]}`;
}

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: t(await getLocale()).api.notSignedIn }, { status: 401 });
  return NextResponse.json({ certificates: await listCertificates(user.id) });
}

export async function POST(req: Request) {
  const m = t(await getLocale()).api;
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: m.notSignedIn }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const files = (form?.getAll("files") ?? []).filter((f): f is File => f instanceof File);
  if (!files.length) return NextResponse.json({ error: m.noFiles }, { status: 400 });

  const certificates: CmeCertificate[] = [];
  const errors: { fileName: string; error: string }[] = [];

  // Images and scanned PDFs are OCR'd in the browser; their text arrives as "ocrText_<index>" (or "ocrText" for a single file)
  const ocrFor = (i: number) => {
    const v = form?.get(`ocrText_${i}`) ?? (files.length === 1 ? form?.get("ocrText") : null);
    return typeof v === "string" ? v.slice(0, MAX_OCR_CHARS) : null;
  };

  for (const [i, file] of files.entries()) {
    if (file.size > MAX_BYTES) {
      errors.push({ fileName: file.name, error: m.fileTooBig });
      continue;
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    const type = sniffType(bytes);
    if (!type) {
      errors.push({ fileName: file.name, error: m.onlyTypes });
      continue;
    }

    const id = randomUUID();
    const safeName = sanitizeName(file.name, type);
    const cert: CmeCertificate = {
      id,
      userId: user.id,
      fileName: file.name.slice(0, 200) || safeName,
      filePath: `users/${user.id}/files/${id}/${safeName}`,
      contentType: type,
      uploadedAt: new Date().toISOString(),
      status: "parsing",
      ...EMPTY_FIELDS,
      parseNotes: null,
    };

    try {
      await putBytes(cert.filePath, bytes, type);
      await saveCertificate(cert);
    } catch (err) {
      console.error("certificate upload", err);
      errors.push({ fileName: file.name, error: m.storeFailed });
      continue;
    }

    const result = await parseCertificate(bytes, type, user.profile, ocrFor(i));
    const done: CmeCertificate = { ...cert, ...result.fields, status: result.status, parseNotes: result.notes };
    await saveCertificate(done);
    certificates.push(done);
  }

  if (!certificates.length) return NextResponse.json({ certificates, errors, error: errors[0]?.error }, { status: 400 });
  return NextResponse.json({ certificates, errors });
}
