import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/PasswordResetForms";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await getLocale()).reset.forgotTitle, robots: { index: false } };
}

export default async function ForgotPasswordPage() {
  return <ForgotPasswordForm locale={await getLocale()} />;
}
