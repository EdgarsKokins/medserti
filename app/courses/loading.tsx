import { getLocale } from "@/lib/i18n/server";
import { courseStrings } from "@/components/courses/strings";

/** Shown instantly on navigation; the first build of the course list can take ~25 s */
export default async function Loading() {
  const s = courseStrings(await getLocale());
  return (
    <main className="container stack" aria-busy="true">
      <div className="page-head">
        <div>
          <h1>{s.title}</h1>
          <p className="muted">{s.loading}</p>
        </div>
      </div>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="card" style={{ height: 92, opacity: 1 - i * 0.2, background: "var(--surface-2)" }} />
      ))}
    </main>
  );
}
