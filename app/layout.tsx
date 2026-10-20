import type { Metadata } from "next";
import Link from "next/link";
import { IBM_Plex_Sans, Source_Serif_4 } from "next/font/google";
import "./globals.css";
import { currentUserId } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import NavLinks, { NavAuth } from "@/components/NavLinks";
import AppFooter from "@/components/AppFooter";
import { RULES } from "@/lib/rules";
import { THEME_COOKIE, type Theme } from "@/lib/theme";
import { cookies } from "next/headers";

// self-hosted at build time; latin-ext covers Latvian (ā, č, ē, ģ, ī, ķ, ļ, ņ, š, ū, ž)
const plex = IBM_Plex_Sans({ subsets: ["latin", "latin-ext"], weight: ["400", "500", "600"], variable: "--font-plex", display: "swap" });
// Source Serif 4 instead of Newsreader: Newsreader draws "ī" as a dotted i with a floating macron
const serif = Source_Serif_4({ subsets: ["latin", "latin-ext"], weight: ["400", "500", "600"], variable: "--font-source-serif", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const d = t(await getLocale());
  return {
    metadataBase: new URL("https://medserti.lv"),
    // pages set their own name: "Kursi un pasākumi · Medserti"
    title: { default: d.brand.name, template: `%s · ${d.brand.name}` },
    description: d.landing.metaDescription,
    applicationName: d.brand.name,
    openGraph: {
      type: "website",
      siteName: d.brand.name,
      title: d.landing.metaTitle,
      description: d.landing.metaDescription,
      locale: d.landing.ogLocale,
    },
  };
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
      className={`${plex.variable} ${serif.variable}`}
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
            {/* logged-out visitors get no section links: "Par mums" lives on the landing page and in the footer */}
            {signedIn && (
              <NavLinks
                publicNav={false}
                links={[
                  { href: "/dashboard", label: d.nav.dashboard },
                  { href: "/certificates", label: d.nav.certificates },
                  { href: "/courses", label: d.nav.courses },
                  { href: "/profile", label: d.nav.profile },
                ]}
              />
            )}
            <div className="nav-tools">
              {signedIn ? (
                <form action="/api/auth/logout" method="post">
                  <button className="btn" type="submit">{d.nav.logout}</button>
                </form>
              ) : (
                <NavAuth login={d.nav.login} signup={d.nav.signup} />
              )}
            </div>
          </div>
        </nav>
        {children}
        <AppFooter
          theme={theme}
          locale={locale}
          labels={{ nav: d.landing.footerNav, about: d.nav.about, rules: d.landing.footerRules, rulesUrl: RULES.sourceUrl, theme: d.theme, lang: d.lang.label }}
        />
      </body>
    </html>
  );
}
