import { NextResponse } from "next/server";
import { adminNotFound, isAdmin } from "@/lib/admin";
import { resetDemo } from "@/lib/demo";

export const maxDuration = 60;

/** Restores the demo account to its canonical data (button on /admin/lietotaji) */
export async function POST(req: Request) {
  if (!(await isAdmin())) return adminNotFound();
  await resetDemo();
  return NextResponse.redirect(new URL("/admin/lietotaji?demoReset=1", req.url), 303);
}
