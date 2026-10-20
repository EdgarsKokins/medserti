import type { Metadata } from "next";
import Link from "next/link";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await getLocale()).notFound.title };
}

/** Any unknown URL: our own page in the selected language and theme, with a way back */
export default async function NotFound() {
  const d = t(await getLocale());
  return (
    <main className="container status-page">
      <p className="status-code serif" aria-hidden>404</p>
      <h1>{d.notFound.title}</h1>
      <p className="muted">{d.notFound.body}</p>
      <div className="row">
        <Link href="/" className="btn btn-primary">{d.common.home}</Link>
      </div>
    </main>
  );
}
