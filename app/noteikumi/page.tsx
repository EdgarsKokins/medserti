import type { Metadata } from "next";
import Link from "next/link";
import Controller from "@/components/legal/Controller";
import { formatDate, t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { LEGAL_UPDATED } from "@/lib/legal";
import s from "@/components/legal/legal.module.css";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await getLocale()).legal.terms.title };
}

/** Public terms of use: a short list of key points */
export default async function TermsPage() {
  const locale = await getLocale();
  const l = t(locale).legal;
  return (
    <main className={s.page}>
      <h1 className={s.title}>{l.terms.title}</h1>
      <p className={s.lead}>{l.terms.lead}</p>
      <p className={s.updated}>{l.updated}: {formatDate(LEGAL_UPDATED, locale)}</p>

      <ol className={s.points}>
        {l.terms.points.map((point, i) => <li key={i}>{point}</li>)}
      </ol>

      <section className={s.section}>
        <h2>{l.controllerTitle}</h2>
        <Controller l={l} />
        <p className={s.seeAlso}><Link href="/privatums">{l.seeAlsoPrivacy}</Link></p>
      </section>
    </main>
  );
}
