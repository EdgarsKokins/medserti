import { NextResponse } from "next/server";
import { passwordMatches, startAdminSession } from "@/lib/admin";

export const dynamic = "force-dynamic";

/** { password } -> admin cookie. A wrong password waits a second, to slow down guessing. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { password?: unknown } | null;
  if (!passwordMatches(body?.password)) {
    await new Promise((r) => setTimeout(r, 1000));
    return NextResponse.json({ error: "Nepareiza parole." }, { status: 401 });
  }
  await startAdminSession();
  return NextResponse.json({ ok: true });
}
