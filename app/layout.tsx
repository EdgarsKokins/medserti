import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { currentUserId } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import LangSwitch from "@/components/LangSwitch";

export async function generateMetadata(): Promise<Metadata> {
  const d = t(await getLocale());
  return { title: d.brand.name, description: d.brand.tagline, applicationName: d.brand.name };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const signedIn = !!(await currentUserId());
  const locale = await getLocale();
  const d = t(locale);
  return (
    <html lang={locale}>
      <body>
        <nav className="nav">
          <div className="nav-inner">
            <Link href="/" className="brand">{d.brand.name}</Link>
            {signedIn ? (
              <>
                <Link href="/dashboard">{d.nav.dashboard}</Link>
                <Link href="/certificates">{d.nav.certificates}</Link>
                <Link href="/courses">{d.nav.courses}</Link>
                <Link href="/profile">{d.nav.profile}</Link>
                <LangSwitch locale={locale} label={d.lang.label} />
                <form action="/api/auth/logout" method="post">
                  <button className="btn" type="submit">{d.nav.logout}</button>
                </form>
              </>
            ) : (
              <>
                <LangSwitch locale={locale} label={d.lang.label} />
                <Link href="/login">{d.nav.login}</Link>
                <Link href="/register" className="btn btn-primary">{d.nav.signup}</Link>
              </>
            )}
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
