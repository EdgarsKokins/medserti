import AuthForm from "@/components/AuthForm";
import { getLocale } from "@/lib/i18n/server";

export default async function RegisterPage() {
  return <AuthForm mode="register" locale={await getLocale()} />;
}
