import { requireUser } from "@/lib/auth";
import ProfileForm from "@/components/ProfileForm";
import { REGISTER_URL, RULES } from "@/lib/rules";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const user = await requireUser();
  const { welcome } = await searchParams;
  const locale = await getLocale();
  const d = t(locale);
  return (
    <main className="container stack">
      <div className="page-head">
        <div>
          <h1>{d.profile.title}</h1>
          <p className="muted">{d.profile.lead}</p>
        </div>
      </div>
      {welcome && <div className="alert alert-ok">{d.profile.welcome}</div>}
      <ProfileForm initial={user.profile} locale={locale} />
      <div className="card small muted">
        {d.rules.label}: {d.rules.source} (<a href={RULES.sourceUrl} target="_blank" rel="noreferrer">likumi.lv</a>).{" "}
        {d.rules.validFor(RULES.validityYears)} {d.rules.checkDatesIn}{" "}
        <a href={REGISTER_URL} target="_blank" rel="noreferrer">{d.rules.register}</a>.
      </div>
    </main>
  );
}
