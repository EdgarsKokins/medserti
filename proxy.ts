import { NextResponse, type NextRequest } from "next/server";
import { isLocale, isPublicPath, LOCALE_COOKIE, LOCALE_HEADER, localeFromAcceptLanguage, localePath, SUGGEST_HEADER, splitLocalePath } from "@/lib/locale";

const YEAR = 60 * 60 * 24 * 365;

/**
 * Language addresses for the public pages (lib/locale.ts PUBLIC_PATHS):
 * - /ru/par-mums shows /par-mums in Russian and remembers the choice; /ru/<anything else> goes to the page itself
 *   with the language remembered, since signed-in pages have one address
 * - /par-mums is Latvian. A visitor who chose English or Russian before is sent to their version. A first visit
 *   remembers Latvian, so the sign-up that follows is in the same language; a browser that prefers Russian sees an
 *   offer to switch, never a forced redirect (many Latvian doctors run Russian browsers)
 */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const { locale, path } = splitLocalePath(pathname);
  const headers = new Headers(req.headers);

  if (locale !== "lv") {
    if (!isPublicPath(path)) return remember(NextResponse.redirect(new URL(path + req.nextUrl.search, req.url)), locale);
    headers.set(LOCALE_HEADER, locale);
    const url = req.nextUrl.clone();
    url.pathname = path;
    return remember(NextResponse.rewrite(url, { request: { headers } }), locale);
  }

  const chosen = req.cookies.get(LOCALE_COOKIE)?.value;
  if (isLocale(chosen) && chosen !== "lv") return NextResponse.redirect(new URL(localePath(path, chosen) + req.nextUrl.search, req.url));
  headers.set(LOCALE_HEADER, "lv");
  if (chosen) return NextResponse.next({ request: { headers } });
  // first visit: Latvian is what they see, so sign-up and the app continue in Latvian; a Russian browser gets the offer once
  if (localeFromAcceptLanguage(req.headers.get("accept-language")) === "ru") headers.set(SUGGEST_HEADER, path);
  return remember(NextResponse.next({ request: { headers } }), "lv");
}

const remember = (res: NextResponse, locale: string) => {
  res.cookies.set(LOCALE_COOKIE, locale, { path: "/", maxAge: YEAR, sameSite: "lax" });
  return res;
};

export const config = {
  matcher: ["/", "/par-mums", "/kontakti", "/privatums", "/noteikumi", "/en", "/ru", "/en/:path*", "/ru/:path*"],
};
