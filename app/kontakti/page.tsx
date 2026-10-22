import type { Metadata } from "next";
import ContactForm from "@/components/ContactForm";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { CONTROLLER, isPlaceholder } from "@/lib/legal";
import { CONTACT_EMAIL, CONTACT_PHONE } from "@/lib/site";
import s from "@/components/contact.module.css";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await getLocale()).contact.title };
}

/** Public contact page: a message form and the company details. Company name, number and address come from lib/legal.ts. */
export default async function ContactPage() {
  const locale = await getLocale();
  const d = t(locale);
  const c = d.contact;
  const value = (v: string) => (isPlaceholder(v) ? <span className={s.pending}>{d.legal.toBeSpecified}</span> : v);
  return (
    <main className={s.page}>
      <h1 className={s.title}>{c.title}</h1>
      <p className={s.lead}>{c.lead}</p>
      <div className={s.grid}>
        <ContactForm locale={locale} />
        <section aria-labelledby="contact-details" className={s.details}>
          <h2 id="contact-details">{c.details}</h2>
          <dl className={s.facts}>
            <dt>{c.phone}</dt>
            <dd><a href={`tel:${CONTACT_PHONE.replace(/\s/g, "")}`}>{CONTACT_PHONE}</a></dd>
            <dt>{c.emailLabel}</dt>
            <dd><a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></dd>
            <dt>{c.company}</dt>
            <dd>{value(CONTROLLER.name)}</dd>
            <dt>{c.regNo}</dt>
            <dd>{value(CONTROLLER.regNo)}</dd>
            <dt>{c.address}</dt>
            <dd>{value(CONTROLLER.address)}</dd>
          </dl>
        </section>
      </div>
    </main>
  );
}
