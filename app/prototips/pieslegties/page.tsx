import type { Metadata } from "next";
import Link from "next/link";
import AuthForm from "@/components/AuthForm";
import { getLocale } from "@/lib/i18n/server";
import Panel, { type Variant } from "./Panel";
import s from "./proto.module.css";

export const metadata: Metadata = { title: "Prototips: pieslēgšanās", robots: { index: false, follow: false } };

const VARIANTS: { v: Variant; label: string }[] = [
  { v: "A", label: "A · Atveras pa vienam" },
  { v: "B", label: "B · Peldošas uzlīmes" },
  { v: "C", label: "C · Viena skatuve" },
];

/** PROTOTYPE (branch login-panel-prototypes, never merged): three animated versions of the sign-in page's left panel */
export default async function LoginPanelPrototype({ searchParams }: { searchParams: Promise<{ v?: string }> }) {
  const { v } = await searchParams;
  const variant = VARIANTS.find((x) => x.v === v)?.v ?? "A";
  return (
    <>
      <div className={s.bar}>
        <strong>Prototips · Pieslēgšanās</strong>
        {VARIANTS.map((x) => (
          <Link key={x.v} href={`/prototips/pieslegties?v=${x.v}`} className={x.v === variant ? s.barOn : undefined} scroll={false}>{x.label}</Link>
        ))}
        <Link href="/login">Pašreizējā lapa</Link>
      </div>
      <AuthForm mode="login" locale={await getLocale()} panel={<Panel key={variant} variant={variant} />} />
    </>
  );
}
