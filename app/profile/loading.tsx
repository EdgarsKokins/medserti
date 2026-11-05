import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import s from "@/components/profile.module.css";

/** Shown instantly while a page loads; same skeleton cards as /courses */
export default async function Loading() {
  const d = t(await getLocale());
  return (
    <main className="container" aria-busy="true">
      <div className={`stack ${s.page}`}>
        <p className="muted" role="status">{d.common.loading}</p>
        {[0, 1, 2].map((i) => (
          <div key={i} className="card" style={{ height: 92, opacity: 1 - i * 0.25, background: "var(--surface-2)" }} />
        ))}
      </div>
    </main>
  );
}
