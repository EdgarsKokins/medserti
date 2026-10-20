import About from "@/components/About";
import AuthForm from "@/components/AuthForm";
import { getLocale } from "@/lib/i18n/server";

export default async function LoginPage() {
  const locale = await getLocale();
  return (
    <>
      <AuthForm mode="login" locale={locale} />
      <About locale={locale} />
    </>
  );
}
