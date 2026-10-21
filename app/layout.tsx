import type { Metadata } from "next";
import Link from "next/link";
import { Golos_Text, Public_Sans, Schibsted_Grotesk } from "next/font/google";
import "./globals.css";
import { currentUserId } from "@/lib/auth";
import { isDemoUserId } from "@/lib/demo/id";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { loadRuntimeOverrides } from "@/lib/i18n/overrides-server";
import I18nOverrides from "@/components/I18nOverrides";
import NavLinks, { NavAuth } from "@/components/NavLinks";
import AppFooter from "@/components/AppFooter";
import { RULES } from "@/lib/rules";

// self-hosted at build time; latin-ext covers Latvian (ā, č, ē, ģ, ī, ķ, ļ, ņ, š, ū, ž)
// Public Sans for text and controls: built for government services, open and plain numerals for 60+ readers
const body = Public_Sans({ subsets: ["latin", "latin-ext"], weight: ["400", "500", "600", "700"], variable: "--font-body", display: "swap" });
// Schibsted Grotesk for headings and the numbers that matter
const display = Schibsted_Grotesk({ subsets: ["latin", "latin-ext"], weight: ["500", "600", "700"], variable: "--font-display-face", display: "swap" });
// neither face has Cyrillic: Golos Text (made for Russian government services) covers Russian only, via unicode-range.
// It comes first in the font stacks; no fallback face, so Latin letters skip it. Downloaded only on pages with Cyrillic text.
const cyrillic = Golos_Text({ subsets: ["cyrillic"], weight: ["400", "500", "600", "700"], variable: "--font-cyrillic", display: "swap", preload: false, adjustFontFallback: false });

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
  const userId = await currentUserId();
  const signedIn = !!userId;
  const demo = isDemoUserId(userId);
  const locale = await getLocale();
  // already loaded by getLocale(); passed down once so client components get the same texts
  const overrides = await loadRuntimeOverrides();
  const d = t(locale);
  return (
    <html
      lang={locale}
      className={`${body.variable} ${display.variable} ${cyrillic.variable}`}
      data-theme="light"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <body>
        <I18nOverrides data={overrides}>
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
          {demo && (
            <div className="demo-banner" role="note">
              <div className="demo-banner-inner">
                <span>{d.demo.banner}</span>
                <Link href="/register">{d.demo.bannerCta} →</Link>
              </div>
            </div>
          )}
          {children}
          <AppFooter
            locale={locale}
            labels={{ nav: d.landing.footerNav, about: d.nav.about, rules: d.landing.footerRules, privacy: d.legal.privacyLink, terms: d.legal.termsLink, rulesUrl: RULES.sourceUrl, lang: d.lang.label }}
          />
        </I18nOverrides>
      </body>
    </html>
  );
}
