import { NextResponse, type NextRequest } from "next/server";
import { isAdminToken } from "@/lib/admin";
import { SESSION_COOKIE } from "@/lib/auth";

/**
 * /admin for non-admins: serve the ordinary 404 page with a real 404 status. The page checks again itself;
 * this runs first because the root loading.tsx starts streaming (status 200) before a page can call notFound().
 */
export async function proxy(req: NextRequest) {
  if (await isAdminToken(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  return NextResponse.rewrite(new URL("/404", req.url));
}

export const config = { matcher: ["/admin", "/admin/:path*"] };
