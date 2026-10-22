import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { getCertificate } from "@/lib/db";
import { getBytes } from "@/lib/storage";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { FILE_TYPES } from "@/lib/types";

const ALLOWED = new Set<string>(FILE_TYPES);

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const m = t(await getLocale()).api;
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: m.notSignedIn }, { status: 401 });
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: m.notFound }, { status: 404 });

  const cert = await getCertificate(user.id, id);
  if (!cert || cert.userId !== user.id || !cert.filePath.startsWith(`users/${user.id}/files/${id}/`))
    return NextResponse.json({ error: m.notFound }, { status: 404 });

  // the record is read from origin every time, so a deleted certificate is never served; the file itself is written
  // once under a fresh id and never changed, so it may come from the CDN cache, where a hit costs no Blob operation
  const file = await getBytes(cert.filePath, { immutable: true });
  if (!file) return NextResponse.json({ error: m.fileMissing }, { status: 404 });

  const type = ALLOWED.has(cert.contentType) ? cert.contentType : "application/octet-stream";
  const asciiName = cert.filePath.split("/").pop() ?? "certificate";
  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": type,
      "Content-Length": String(file.data.length),
      "Content-Disposition": `inline; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(cert.fileName)}`,
      // browser cache only (never a shared cache): previews, the viewer and the ZIP export reuse the same response
      "Cache-Control": "private, max-age=86400, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
