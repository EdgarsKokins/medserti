import { NextResponse } from "next/server";
import { currentUserId, startSession } from "@/lib/auth";
import { DEMO_USER_ID, ensureDemo } from "@/lib/demo";

export const maxDuration = 60;

/** One-click demo: seeds the demo account if needed and signs the visitor in, no password. */
async function signInDemo(req: Request) {
  // never swap a signed-in user out of their own account (e.g. a demo link opened from elsewhere)
  const current = await currentUserId();
  if (!current || current === DEMO_USER_ID) {
    await ensureDemo();
    await startSession(DEMO_USER_ID);
  }
  return NextResponse.redirect(new URL("/dashboard", req.url), 303);
}

/** Followed from the "Apskatīt demo" links */
export const GET = signInDemo;
/** Kept for forms and older pages that still post */
export const POST = signInDemo;
