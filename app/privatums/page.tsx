import type { Metadata } from "next";
import Link from "next/link";
import Controller from "@/components/legal/Controller";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { DVI_URL, LEGAL_UPDATED } from "@/lib/legal";
import { CONTACT_EMAIL } from "@/lib/site";
import s from "@/components/legal/legal.module.css";
import { formatDate } from "@/lib/format";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await getLocale()).legal.privacy.title };
}

/** Public privacy policy */
export default async function PrivacyPage() {
  const locale = await getLocale();
  const l = t(locale).legal;
  const p = l.privacy;
  return (
    <main className={s.page}>
      <h1 className={s.title}>{p.title}</h1>
      <p className={s.lead}>{p.lead}</p>
      <p className={s.updated}>{l.updated}: {formatDate(LEGAL_UPDATED, locale)}</p>

      <section className={s.section}>
        <h2>{l.controllerTitle}</h2>
        <Controller l={l} />
      </section>

      {p.sections.map((sec) => (
        <section key={sec.title} className={s.section}>
          <h2>{sec.title}</h2>
          <ul>
            {sec.items.map((item, i) => <li key={i}>{item}</li>)}
          </ul>
        </section>
      ))}

      <section className={s.section}>
        <h2>{l.contactTitle}</h2>
        <p>{l.contactBody} <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></p>
      </section>

      <section className={s.section}>
        <h2>{l.complaintTitle}</h2>
        <p>{l.complaintBody} <a href={DVI_URL} target="_blank" rel="noreferrer">dvi.gov.lv</a></p>
        <p className={s.seeAlso}>{l.seeAlsoTerms.pre} <Link href="/noteikumi">{l.seeAlsoTerms.link}</Link>{l.seeAlsoTerms.post}</p>
      </section>
    </main>
  );
}
