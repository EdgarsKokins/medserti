import { NextResponse, type NextRequest } from "next/server";
import { isLocale, isPublicPath, LOCALE_COOKIE, LOCALE_HEADER, localeFromAcceptLanguage, localePath, SUGGEST_HEADER, splitLocalePath } from "@/lib/locale";
import { REMEMBERED_MAX_AGE, renewedToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session-token";

const YEAR = 60 * 60 * 24 * 365;

/** The matcher below holds the public language addresses and the signed-in pages, which have no language address */
export function proxy(req: NextRequest) {
  const { locale, path } = splitLocalePath(req.nextUrl.pathname);
  return locale === "lv" && !isPublicPath(path) ? renewSession(req) : languageAddress(req);
}

/**
 * "Remember me": a signed-in page gives a remembered login a fresh 30 days, at most once a day (lib/session-token.ts).
 * It lives here because server components cannot set cookies. No storage is read or written, only the token's signature
 * is checked: currentUser() still decides if the session is valid, and a re-issued token keeps its old `sv`.
 * Client-side navigation and link prefetches pass here too, so someone working in an open tab renews as well.
 */
async function renewSession(req: NextRequest) {
  const res = NextResponse.next();
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const renewed = token ? await renewedToken(token) : null;
  if (renewed) res.cookies.set(SESSION_COOKIE, renewed, sessionCookieOptions(REMEMBERED_MAX_AGE));
  return res;
}

/**
 * Language addresses for the public pages (lib/locale.ts PUBLIC_PATHS):
 * - /ru/par-mums shows /par-mums in Russian and remembers the choice; /ru/<anything else> goes to the page itself
 *   with the language remembered, since signed-in pages have one address
 * - /par-mums is Latvian. A visitor who chose English or Russian before is sent to their version. A first visit
 *   remembers Latvian, so the sign-up that follows is in the same language; a browser that prefers Russian sees an
 *   offer to switch, never a forced redirect (many Latvian doctors run Russian browsers)
 */
export function languageAddress(req: NextRequest) {
  const { locale, path } = splitLocalePath(req.nextUrl.pathname);
  const headers = new Headers(req.headers);

  if (locale !== "lv") {
    if (!isPublicPath(path)) return remember(req, NextResponse.redirect(new URL(path + req.nextUrl.search, req.url)), locale);
    headers.set(LOCALE_HEADER, locale);
    const url = req.nextUrl.clone();
    url.pathname = path;
    return remember(req, NextResponse.rewrite(url, { request: { headers } }), locale);
  }

  const chosen = req.cookies.get(LOCALE_COOKIE)?.value;
  if (isLocale(chosen) && chosen !== "lv") return NextResponse.redirect(new URL(localePath(path, chosen) + req.nextUrl.search, req.url));
  headers.set(LOCALE_HEADER, "lv");
  if (chosen) return NextResponse.next({ request: { headers } });
  // first visit: Latvian is what they see, so sign-up and the app continue in Latvian; a Russian browser gets the offer once
  if (localeFromAcceptLanguage(req.headers.get("accept-language")) === "ru") headers.set(SUGGEST_HEADER, path);
  return remember(req, NextResponse.next({ request: { headers } }), "lv");
}

/**
 * Only a page load chooses a language. Next.js fetches the links in view ahead of a click, and the footer's /en/par-mums,
 * fetched as the switch to Latvian re-rendered the page, set the cookie back to English (05 Nov 2026). Next.js hides its
 * own prefetch headers from the proxy, so this asks the browser what the request is for. Browsers without Sec-Fetch-Dest
 * are told apart by Accept.
 */
const isPageLoad = (req: NextRequest) => {
  const dest = req.headers.get("sec-fetch-dest");
  return dest ? dest === "document" : (req.headers.get("accept") ?? "").includes("text/html");
};

const remember = (req: NextRequest, res: NextResponse, locale: string) => {
  if (isPageLoad(req)) res.cookies.set(LOCALE_COOKIE, locale, { path: "/", maxAge: YEAR, sameSite: "lax" });
  return res;
};

export const config = {
  matcher: ["/", "/par-mums", "/kontakti", "/privatums", "/noteikumi", "/en", "/ru", "/en/:path*", "/ru/:path*", "/dashboard", "/certificates", "/courses", "/profile", "/export"],
};
