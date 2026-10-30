import { z } from "zod";
import { adminNotFound, isAdmin } from "@/lib/admin";
import { logAdminView } from "@/lib/admin-audit";
import { getCertificate } from "@/lib/db";
import { getBytes } from "@/lib/storage";
import { FILE_TYPES } from "@/lib/types";

const ALLOWED = new Set<string>(FILE_TYPES);
const isUuid = (s: string) => z.uuid().safeParse(s).success;

/**
 * A user's uploaded certificate file, for support: to see why a certificate was read wrong (privacy policy,
 * "Piekļuve atbalstam"). Admin only, and every view is logged. Same ownership check as the user's own file route.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ userId: string; certId: string }> }) {
  if (!(await isAdmin())) return adminNotFound();
  const { userId, certId } = await params;
  if (!isUuid(userId) || !isUuid(certId)) return adminNotFound();
  const cert = await getCertificate(userId, certId);
  if (!cert || cert.userId !== userId || !cert.filePath.startsWith(`users/${userId}/files/${certId}/`)) return adminNotFound();
  const file = await getBytes(cert.filePath, { immutable: true });
  if (!file) return adminNotFound();
  await logAdminView(userId, "file", certId);

  const type = ALLOWED.has(cert.contentType) ? cert.contentType : "application/octet-stream";
  const asciiName = cert.filePath.split("/").pop() ?? "certificate";
  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": type,
      "Content-Length": String(file.data.length),
      "Content-Disposition": `inline; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(cert.fileName)}`,
      // a user's file: never kept by the admin's browser or any shared cache
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
