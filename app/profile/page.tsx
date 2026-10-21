import { isDemoUser, requireUser } from "@/lib/auth";
import ProfileForm from "@/components/ProfileForm";
import DeleteAccount from "@/components/legal/DeleteAccount";
import { profileComplete } from "@/lib/profile";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import s from "@/components/profile.module.css";

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const user = await requireUser();
  const { welcome } = await searchParams;
  const locale = await getLocale();
  const d = t(locale);
  const demo = isDemoUser(user);
  const onboarding = !profileComplete(user.profile);
  return (
    <main className="container">
      <h1 className={s.head}>{d.profile.title}</h1>
      {welcome && <div className="alert alert-ok" style={{ margin: "16px 0 24px" }}>{d.profile.welcome}</div>}
      <ProfileForm initial={user.profile} locale={locale} readOnly={demo} onboarding={onboarding} />
      {/* not while signing up; the shared demo account cannot be deleted (the API refuses it too) */}
      {!demo && !onboarding && <DeleteAccount locale={locale} />}
    </main>
  );
}
