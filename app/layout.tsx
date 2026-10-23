import type { Metadata } from "next";
import Link from "next/link";
import "./fonts.css";
import "./globals.css";
import { currentUser, currentUserId } from "@/lib/auth";
import { isDemoUserId } from "@/lib/demo/id";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { loadRuntimeOverrides } from "@/lib/i18n/overrides-server";
import I18nOverrides from "@/components/I18nOverrides";
import DictProvider from "@/components/i18n/DictProvider";
import NavLinks, { NavAuth } from "@/components/NavLinks";
import AppFooter from "@/components/AppFooter";
import ErrorReporter from "@/components/monitoring/ErrorReporter";
import AnalyticsClient from "@/components/monitoring/AnalyticsClient";
import { NURSE_RULES, REGISTER_URL, RULES } from "@/lib/rules";

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
  // the legal basis behind every number, for signed-in pages; nurses re-register under Reg. 630, everyone else under Reg. 391
  const user = signedIn ? await currentUser() : null;
  const nurse = user?.profile.profession === "nurse";
  const note = user ? (
    <>
      {d.rules.label}: {nurse ? d.rules.sourceNurse : d.rules.source} (
      <a href={nurse ? NURSE_RULES.sourceUrl : RULES.sourceUrl} target="_blank" rel="noreferrer">likumi.lv</a>).{" "}
      {!nurse && <>{d.rules.validFor(RULES.validityYears)} </>}
      {nurse ? d.rules.checkOfficialInNurse : d.rules.checkOfficialIn}{" "}
      <a href={REGISTER_URL} target="_blank" rel="noreferrer">{d.rules.register}</a>.
    </>
  ) : null;
  return (
    <html
      lang={locale}
      data-theme="light"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <body>
        <I18nOverrides data={overrides}>
          {/* client components read their strings here; only this language's dictionary reaches the browser */}
          <DictProvider locale={locale}>
            <nav className="nav">
              <div className="nav-inner">
                {/* the demo account's logo goes to the public homepage, which ends the demo */}
                <Link href={signedIn && !demo ? "/dashboard" : "/"} className="brand" aria-label={d.brand.name}>
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
            <div className="page-body">{children}</div>
            <AppFooter
              locale={locale}
              signedIn={signedIn}
              demo={demo}
              note={note}
              labels={{
                brand: d.brand.name,
                tagline: d.brand.tagline,
                nav: d.landing.footerNav,
                signup: d.nav.signup,
                login: d.nav.login,
                demo: d.demo.try,
                about: d.nav.about,
                rules: nurse ? d.landing.footerRulesNurse : d.landing.footerRules,
                rulesUrl: nurse ? NURSE_RULES.sourceUrl : RULES.sourceUrl,
                privacy: d.legal.privacyLink,
                terms: d.legal.termsLink,
                contactLabel: d.landing.footerContact,
                contactCta: d.contact.cta,
                lang: d.lang.label,
                base: nurse ? d.rules.planningAidNurse : d.rules.planningAid,
              }}
            />
          </DictProvider>
        </I18nOverrides>
        {/* uncaught browser errors to /api/errors (lib/monitoring); cookieless page views to Vercel Web Analytics */}
        <ErrorReporter />
        <AnalyticsClient />
      </body>
    </html>
  );
}
