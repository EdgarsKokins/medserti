import { NextResponse } from "next/server";
import { passwordMatches, startAdminSession } from "@/lib/admin";
import { clientIp, rateLimit, underLimit } from "@/lib/password-reset";

export const dynamic = "force-dynamic";

// failed attempts per IP: 10 per 15 minutes
const LIMIT = [10, 15 * 60 * 1000] as const;

/** { password } -> admin cookie. A wrong password waits a second, to slow down guessing. */
export async function POST(req: Request) {
  const key = `admin-login-ip:${clientIp(req)}`;
  if (!(await underLimit(key, ...LIMIT)))
    return NextResponse.json({ error: "Pārāk daudz mēģinājumu. Mēģiniet vēlreiz pēc 15 minūtēm." }, { status: 429 });
  const body = (await req.json().catch(() => null)) as { password?: unknown } | null;
  if (!passwordMatches(body?.password)) {
    await rateLimit(key, ...LIMIT);
    await new Promise((r) => setTimeout(r, 1000));
    return NextResponse.json({ error: "Nepareiza parole." }, { status: 401 });
  }
  await startAdminSession();
  return NextResponse.json({ ok: true });
}
