import { NextResponse } from "next/server";
import { currentUserId, endSession } from "@/lib/auth";
import { isDemoUserId } from "@/lib/demo/id";

/** Ends a demo session only; a real account opening the homepage stays signed in */
export async function POST() {
  if (isDemoUserId(await currentUserId())) await endSession();
  return NextResponse.json({ ok: true });
}
