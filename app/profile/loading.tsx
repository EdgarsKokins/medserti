import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";

/** Shown instantly while a page loads; same skeleton cards as /courses */
export default async function Loading() {
  const d = t(await getLocale());
  return (
    <main className="container stack" aria-busy="true">
      <p className="muted" role="status">{d.common.loading}</p>
      {[0, 1, 2].map((i) => (
        <div key={i} className="card" style={{ height: 92, opacity: 1 - i * 0.25, background: "var(--surface-2)" }} />
      ))}
    </main>
  );
}
