import AuthForm from "@/components/AuthForm";
import { getLocale } from "@/lib/i18n/server";
import { specialtiesFor } from "@/lib/specialties";
import type { Profession } from "@/lib/types";

/** Professions a specialty from the landing page's course sample can belong to; dentists before doctors, whose list holds the dental codes too */
const FROM_SAMPLE: Profession[] = ["dentist", "doctor", "functional_specialist"];

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ specialitate?: string | string[] }> }) {
  const { specialitate } = await searchParams;
  const code = typeof specialitate === "string" ? specialitate : null;
  const profession = code ? FROM_SAMPLE.find((p) => specialtiesFor(p).some((sp) => sp.code === code)) : undefined;
  return <AuthForm mode="register" locale={await getLocale()} initial={profession ? { profession, specialty: code } : null} />;
}
