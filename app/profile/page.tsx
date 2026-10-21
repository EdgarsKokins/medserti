import { isDemoUser, requireUser } from "@/lib/auth";
import ProfileForm from "@/components/ProfileForm";
import DeleteAccount from "@/components/legal/DeleteAccount";
import { NURSE_RULES, REGISTER_URL, RULES } from "@/lib/rules";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import s from "@/components/profile.module.css";

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const user = await requireUser();
  const { welcome } = await searchParams;
  const locale = await getLocale();
  const d = t(locale);
  const demo = isDemoUser(user);
  const nurse = user.profile.profession === "nurse";
  return (
    <main className="container">
      <h1 className={s.head}>{d.profile.title}</h1>
      {welcome && <div className="alert alert-ok" style={{ margin: "16px 0 24px" }}>{d.profile.welcome}</div>}
      <ProfileForm initial={user.profile} locale={locale} readOnly={demo} />
      <p className={s.footnote}>
        {nurse ? (
          <>
            {d.rules.label}: {d.rules.sourceNurse} (<a href={NURSE_RULES.sourceUrl} target="_blank" rel="noreferrer">likumi.lv</a>).{" "}
          </>
        ) : (
          <>
            {d.rules.label}: {d.rules.source} (<a href={RULES.sourceUrl} target="_blank" rel="noreferrer">likumi.lv</a>).{" "}
            {d.rules.validFor(RULES.validityYears)}{" "}
          </>
        )}
        {d.rules.checkDatesIn}{" "}
        <a href={REGISTER_URL} target="_blank" rel="noreferrer">{d.rules.register}</a>.
      </p>
      {/* the shared demo account cannot be deleted; the API refuses it too */}
      {!demo && <DeleteAccount locale={locale} />}
    </main>
  );
}
