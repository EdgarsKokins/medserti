import type { Metadata } from "next";
import Link from "next/link";
import { IBM_Plex_Sans, Newsreader } from "next/font/google";
import "./globals.css";
import { currentUserId } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import LangSwitch from "@/components/LangSwitch";
import NavLinks from "@/components/NavLinks";
import ThemeSwitch from "@/components/ThemeSwitch";
import { THEME_COOKIE, type Theme } from "@/lib/theme";
import { cookies } from "next/headers";

// self-hosted at build time; latin-ext covers Latvian (ā, č, ē, ģ, ī, ķ, ļ, ņ, š, ū, ž)
const plex = IBM_Plex_Sans({ subsets: ["latin", "latin-ext"], weight: ["400", "500", "600"], variable: "--font-plex", display: "swap" });
const newsreader = Newsreader({ subsets: ["latin", "latin-ext"], weight: ["400", "500"], variable: "--font-newsreader", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const d = t(await getLocale());
  return { title: d.brand.name, description: d.brand.tagline, applicationName: d.brand.name };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const signedIn = !!(await currentUserId());
  const locale = await getLocale();
  const d = t(locale);
  const saved = (await cookies()).get(THEME_COOKIE)?.value;
  const theme: Theme = saved === "light" || saved === "dark" ? saved : "system";
  return (
    <html
      lang={locale}
      className={`${plex.variable} ${newsreader.variable}`}
      data-theme={theme === "system" ? undefined : theme}
      suppressHydrationWarning
    >
      <body>
        <nav className="nav">
          <div className="nav-inner">
            <Link href={signedIn ? "/dashboard" : "/"} className="brand" aria-label={d.brand.name}>
              <span className="brand-seal" aria-hidden>M</span>
              <span className="brand-name">{d.brand.name}</span>
            </Link>
            {signedIn && (
              <NavLinks
                links={[
                  { href: "/dashboard", label: d.nav.dashboard },
                  { href: "/certificates", label: d.nav.certificates },
                  { href: "/courses", label: d.nav.courses },
                  { href: "/profile", label: d.nav.profile },
                ]}
              />
            )}
            <div className="nav-tools">
              <ThemeSwitch initial={theme} labels={d.theme} />
              <LangSwitch locale={locale} label={d.lang.label} />
              {signedIn ? (
                <form action="/api/auth/logout" method="post">
                  <button className="btn" type="submit">{d.nav.logout}</button>
                </form>
              ) : (
                <>
                  <Link href="/login" className="btn">{d.nav.login}</Link>
                  <Link href="/register" className="btn btn-primary">{d.nav.signup}</Link>
                </>
              )}
            </div>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
