import { NextResponse } from "next/server";
import { adminNotFound, currentAdmin } from "@/lib/admin";
import { validateOverrides } from "@/lib/i18n/catalog";
import {
  readPreviousOverrides,
  readStoredOverrides,
  restorePreviousOverrides,
  saveStoredOverrides,
} from "@/lib/i18n/overrides-server";

export const dynamic = "force-dynamic";

const MAX_BODY = 1_000_000;

/** Current overrides (for the backup download) */
export async function GET() {
  if (!(await currentAdmin())) return adminNotFound();
  const [overrides, prev] = await Promise.all([readStoredOverrides(), readPreviousOverrides()]);
  return NextResponse.json({ overrides, hasPrevious: !!prev }, { headers: { "Cache-Control": "no-store" } });
}

/** Save the full set of overrides. Body: { lv: { key: text }, en: { key: text } } */
export async function PUT(req: Request) {
  if (!(await currentAdmin())) return adminNotFound();
  // JSON only: a cross-site form cannot send this content type without a CORS preflight
  if (!req.headers.get("content-type")?.includes("application/json")) {
    return NextResponse.json({ error: "Nederīgs pieprasījums." }, { status: 415 });
  }
  const raw = await req.text();
  if (raw.length > MAX_BODY) return NextResponse.json({ error: "Pārāk liels apjoms." }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Nederīgs JSON." }, { status: 400 });
  }
  const res = validateOverrides(body);
  if (!res.ok) return NextResponse.json({ error: "Dažus tekstus nevar saglabāt.", problems: res.problems }, { status: 422 });
  await saveStoredOverrides(res.value);
  return NextResponse.json({ overrides: res.value, hasPrevious: true });
}

/** { action: "restore" }: swap in the version before the last save */
export async function POST(req: Request) {
  if (!(await currentAdmin())) return adminNotFound();
  if (!req.headers.get("content-type")?.includes("application/json")) {
    return NextResponse.json({ error: "Nederīgs pieprasījums." }, { status: 415 });
  }
  const body = (await req.json().catch(() => null)) as { action?: unknown } | null;
  if (body?.action !== "restore") return NextResponse.json({ error: "Nezināma darbība." }, { status: 400 });
  const restored = await restorePreviousOverrides();
  if (!restored) return NextResponse.json({ error: "Iepriekšējas versijas nav." }, { status: 404 });
  return NextResponse.json({ overrides: restored, hasPrevious: true });
}

/* other methods: the same 404 as everyone else gets, instead of a 405 that shows the route exists */
export const DELETE = async () => adminNotFound();
export const PATCH = async () => adminNotFound();
