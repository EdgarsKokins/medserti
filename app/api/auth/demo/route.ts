import { NextResponse } from "next/server";
import { startSession } from "@/lib/auth";
import { DEMO_USER_ID, ensureDemo } from "@/lib/demo";

export const maxDuration = 60;

/** One-click demo: seeds the demo account if needed and signs the visitor in, no password. Posted by a plain form. */
export async function POST(req: Request) {
  await ensureDemo();
  await startSession(DEMO_USER_ID);
  return NextResponse.redirect(new URL("/dashboard", req.url), 303);
}
