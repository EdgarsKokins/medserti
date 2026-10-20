import type { Metadata } from "next";
import About from "@/components/About";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const d = t(await getLocale());
  return { title: `${d.about.title} · ${d.brand.name}` };
}

/** Public "About us" page; the same section also sits under the login and register forms */
export default async function AboutPage() {
  const locale = await getLocale();
  return (
    <main>
      <About locale={locale} page />
    </main>
  );
}
