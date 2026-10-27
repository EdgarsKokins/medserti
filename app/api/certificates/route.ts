import { NextResponse } from "next/server";
import { createHash, randomUUID } from "crypto";
import { currentUser, requireWritableUser } from "@/lib/auth";
import { listCertificates, saveCertificate, unreadableNote } from "@/lib/db";
import { putBytes, remove } from "@/lib/storage";
import { EMPTY_FIELDS, parseCertificate, withContent } from "@/lib/parse";
import { autoConfirmBlocks, findDuplicate } from "@/lib/parse/confidence";
import { applyTipLookup } from "@/lib/parse/tipMatch";
import { lookupTip } from "@/lib/tipRegistry";
import { certificateWindow } from "@/lib/rules";
import type { CmeCertificate, ParseNote } from "@/lib/types";
import { stripMarks } from "@/lib/text";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { todayLv } from "@/lib/format";
import { reportServerError } from "@/lib/monitoring/errors";
import { rateLimit } from "@/lib/password-reset";

export const maxDuration = 60;

const MAX_BYTES = 4.5 * 1024 * 1024; // Vercel request body limit
const MAX_OCR_CHARS = 50_000;
// a five-year backlog is rarely over 100 certificates; this stops a script from burning the Blob quota
const UPLOAD_LIMIT = [150, 60 * 60 * 1000] as const;
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
  const stem = stripMarks(base.replace(/\.[^.]*$/, ""))
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

/** The LĀB register lists events approved in Latvia; a master class abroad or a certificate with no title has nothing to find */
const needsLookup = (r: Awaited<ReturnType<typeof parseCertificate>>) =>
  (r.content == null || r.content === "certificate") &&
  r.fields.points == null && !!r.fields.title && (r.fields.country == null || r.fields.country === "LV") && r.fields.category !== "lecture_or_publication";

const QUALITY_REASONS = new Set(["blurry", "dark", "bright", "small", "unreadable", "screen"]);
const CONTENT_FLAGS = new Set(["noText", "notCertificate"]);

/** Put the "photo may be blurry" note first, so the review panel says why the fields may be wrong */
function withImageNote(notes: string | null, reason: string): string {
  const list: ParseNote[] = notes ? JSON.parse(notes) : [];
  return JSON.stringify([{ code: "imageBlurry", p: { reason } }, ...list]);
}

export async function POST(req: Request) {
  const m = t(await getLocale()).api;
  const g = await requireWritableUser();
  if (!g.ok) return g.response;
  const { user } = g;
  if (!(await rateLimit(`upload-user:${user.id}`, ...UPLOAD_LIMIT))) return NextResponse.json({ error: m.tooMany }, { status: 429 });

  // one file per request (the upload queue sends them one by one, with per-file progress)
  const form = await req.formData().catch(() => null);
  const file = form?.get("files");
  if (!(file instanceof File)) return NextResponse.json({ error: m.noFiles }, { status: 400 });
  const fail = (error: string) => NextResponse.json({ certificates: [], errors: [{ fileName: file.name, error }], error }, { status: 400 });

  if (file.size > MAX_BYTES) return fail(m.fileTooBig);
  const bytes = Buffer.from(await file.arrayBuffer());
  const type = sniffType(bytes);
  if (!type) return fail(m.onlyTypes);
  // images and scanned PDFs are OCR'd in the browser; their text arrives as "ocrText"
  const ocr = form?.get("ocrText");
  const ocrText = typeof ocr === "string" ? ocr.slice(0, MAX_OCR_CHARS) : null;
  // the browser's blurry-photo check flagged this file and the user uploaded it anyway (lib/parse/imageQuality.ts)
  const quality = form?.get("imageQuality");
  const qualityReason = typeof quality === "string" ? quality.split(",").find((q) => QUALITY_REASONS.has(q)) ?? null : null;
  // tesseract's confidence for ocrText: the server's own "is this a certificate?" check uses it to tell photo noise from text
  const conf = Number(form?.get("ocrConfidence"));
  const ocrConfidence = form?.get("ocrConfidence") != null && Number.isFinite(conf) ? Math.max(0, Math.min(100, conf)) : null;
  // the browser's "is this a certificate?" check said no and the user uploaded anyway. The server judges the text itself
  // (never trusting the browser alone); the browser's word counts only when the server had no text to judge.
  const claim = form?.get("contentCheck");
  const contentClaim = typeof claim === "string" && CONTENT_FLAGS.has(claim) ? (claim as "noText" | "notCertificate") : null;

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
  } catch (err) {
    console.error("certificate upload", err);
    await reportServerError(err, "/api/certificates (store file)", user.id);
    return fail(m.storeFailed);
  }

  // The record is written once, after parsing: no "parsing" placeholder that a crash could leave behind.
  // A parser error still stores the file, as "failed" with a note, so the user can enter the details by hand.
  const fileHash = createHash("sha256").update(bytes).digest("hex");
  let done: CmeCertificate;
  // the account's first certificate: the browser counts it as a funnel step (Vercel Analytics, no personal data)
  let first = false;
  try {
    const [read, all] = await Promise.all([parseCertificate(bytes, type, user.profile, ocrText, ocrConfidence), listCertificates(user.id)]);
    const parsed = read.content == null && contentClaim ? withContent(read, contentClaim) : read;
    first = all.length === 0;
    // no points printed on a Latvian event: look it up in the LĀB register (filled in for the user to confirm, never confirmed)
    const result = applyTipLookup(parsed, needsLookup(parsed) ? await lookupTip({
      title: parsed.fields.title,
      organizer: parsed.fields.organizer,
      date: parsed.fields.date,
      endDate: parsed.fields.endDate,
      dateConfidence: parsed.fields.fieldConfidence?.date ?? 0,
      text: ocrText ?? "",
    }) : null);
    // confirm without the user only when nothing is a guess (rules in lib/parse/confidence.ts)
    const blocks = autoConfirmBlocks({
      source: result.source,
      pointsKind: result.pointsKind,
      fields: result.fields,
      window: certificateWindow(user.profile),
      existing: all,
      fileHash,
      today: todayLv(),
      content: result.content,
    });
    const auto = blocks.length === 0;
    done = {
      ...cert,
      ...result.fields,
      status: auto ? "confirmed" : result.status,
      autoConfirmed: auto,
      fileHash,
      duplicateOf: findDuplicate(all, result.fields, fileHash),
      tipLookup: result.tipLookup,
      parseNotes: qualityReason ? withImageNote(result.notes, qualityReason) : result.notes,
    };
  } catch (err) {
    console.error("certificate parse", err);
    await reportServerError(err, "/api/certificates (parse)", user.id);
    done = { ...cert, status: "failed", fileHash, parseNotes: unreadableNote(type) };
  }

  try {
    await saveCertificate(done);
  } catch (err) {
    console.error("certificate save", err);
    await reportServerError(err, "/api/certificates (save)", user.id);
    await remove(`users/${user.id}/files/${id}/`).catch(() => {});
    return fail(m.storeFailed);
  }
  return NextResponse.json({ certificates: [done], errors: [], first });
}
