import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/PasswordResetForms";
import { readResetToken } from "@/lib/password-reset";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await getLocale()).reset.newTitle, robots: { index: false }, referrer: "no-referrer" };
}

/** Checks the token up front so an expired or used link shows the "request a new one" state right away */
export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const valid = typeof token === "string" && !!(await readResetToken(token));
  return <ResetPasswordForm locale={await getLocale()} token={valid ? token : null} />;
}
