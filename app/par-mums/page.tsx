import type { Metadata } from "next";
import About from "@/components/About";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { languageAlternates, localePath } from "@/lib/locale";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: t(locale).about.title, alternates: languageAlternates("/par-mums", locale) };
}

/** Public "About us" page; the same section sits on the landing page */
export default async function AboutPage() {
  const locale = await getLocale();
  return (
    <main>
      <About locale={locale} page />
    </main>
  );
}
