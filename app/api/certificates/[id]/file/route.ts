import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { getCertificate } from "@/lib/db";
import { getBytes } from "@/lib/storage";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";

const ALLOWED = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const m = t(await getLocale()).api;
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: m.notSignedIn }, { status: 401 });
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: m.notFound }, { status: 404 });

  const cert = await getCertificate(user.id, id);
  if (!cert || cert.userId !== user.id || !cert.filePath.startsWith(`users/${user.id}/files/${id}/`))
    return NextResponse.json({ error: m.notFound }, { status: 404 });

  const file = await getBytes(cert.filePath);
  if (!file) return NextResponse.json({ error: m.fileMissing }, { status: 404 });

  const type = ALLOWED.has(cert.contentType) ? cert.contentType : "application/octet-stream";
  const asciiName = cert.filePath.split("/").pop() ?? "certificate";
  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": type,
      "Content-Length": String(file.data.length),
      "Content-Disposition": `inline; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(cert.fileName)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
