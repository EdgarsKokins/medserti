import Link from "next/link";
import LangSwitch from "@/components/LangSwitch";
import DemoButton from "@/components/DemoButton";
import ReportProblem from "@/components/monitoring/ReportProblem";
import type { Locale } from "@/lib/i18n";
import { CONTACT_EMAIL } from "@/lib/site";
import s from "./app-footer.module.css";

/** The one site footer, on every page (landing included). Signed-out visitors also get sign-up, log-in and demo links. */
export default function AppFooter({
  locale,
  signedIn,
  demo = false,
  note,
  labels,
}: {
  locale: Locale;
  signedIn: boolean;
  /** the shared demo account: the problem report form asks for an email to reply to */
  demo?: boolean;
  /** signed in: which regulation the numbers follow, and where to check official dates */
  note?: React.ReactNode;
  labels: {
    brand: string;
    tagline: string;
    nav: string;
    signup: string;
    login: string;
    demo: string;
    about: string;
    rules: string;
    rulesUrl: string;
    privacy: string;
    terms: string;
    contactLabel: string;
    contactCta: string;
    lang: string;
    base: string;
  };
}) {
  return (
    <footer className={s.footer}>
      <div className={s.inner}>
        <div className={s.brand}>
          <span className="brand-seal" aria-hidden>M</span>
          <div>
            <div className={s.name}>{labels.brand}</div>
            <div className={`small ${s.muted}`}>{labels.tagline}</div>
          </div>
        </div>
        <nav aria-label={labels.nav}>
          <ul className={s.links}>
            {!signedIn && (
              <>
                <li><Link href="/register">{labels.signup}</Link></li>
                <li><Link href="/login">{labels.login}</Link></li>
                <li><DemoButton label={labels.demo} className="" /></li>
              </>
            )}
            <li><Link href="/par-mums">{labels.about}</Link></li>
            <li><a href={labels.rulesUrl} target="_blank" rel="noreferrer">{labels.rules}</a></li>
            <li><Link href="/privatums">{labels.privacy}</Link></li>
            <li><Link href="/noteikumi">{labels.terms}</Link></li>
            {signedIn && <li><ReportProblem demo={demo} className={s.reportLink} /></li>}
          </ul>
        </nav>
        <div className={s.contact}>
          <div className={s.label}>{labels.contactLabel}</div>
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          <Link href="/kontakti" className={`btn ${s.contactBtn}`}>{labels.contactCta}</Link>
        </div>
        <div className={s.tools}>
          <LangSwitch locale={locale} label={labels.lang} />
        </div>
      </div>
      <div className={s.base}>
        {note && <p className={`small ${s.muted} ${s.note}`}>{note}</p>}
        <span className={`small ${s.muted}`}>© {new Date().getFullYear()} {labels.brand}. {labels.base}</span>
      </div>
    </footer>
  );
}
