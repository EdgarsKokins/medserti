import type { Metadata } from "next";
import { isAdmin } from "@/lib/admin";
import AdminLogin from "@/components/admin/AdminLogin";
import AdminNav from "@/components/admin/AdminNav";
import { KEEP_DAYS } from "@/lib/monitoring/day";
import { readErrorDays, type ErrorItem } from "@/lib/monitoring/errors";
import { readFeedbackDays } from "@/lib/monitoring/feedback";
import s from "./kludas.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Kļūdas", robots: { index: false, follow: false } };

const DAYS = 7;
const when = new Intl.DateTimeFormat("lv-LV", { timeZone: "Europe/Riga", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const at = (iso: string) => when.format(new Date(iso));
const SOURCE: Record<ErrorItem["source"], string> = { server: "Serveris", client: "Pārlūks", ui: "Pieprasījums" };

/** Errors of the last 7 days by fingerprint, and "Ziņot par problēmu" messages. 2 Redis commands per view. Admin texts stay in Latvian. */
export default async function ErrorsAdminPage() {
  if (!(await isAdmin())) {
    return (
      <main className="container">
        <AdminLogin />
      </main>
    );
  }
  const [errorDays, feedbackDays] = await Promise.all([readErrorDays(DAYS), readFeedbackDays(DAYS)]);

  // one row per fingerprint across the days: total count, days seen, first and last time
  const rows = new Map<string, ErrorItem & { days: number; userCount: number }>();
  for (const day of errorDays) {
    for (const it of Object.values(day.items)) {
      const cur = rows.get(it.fp);
      rows.set(
        it.fp,
        cur
          ? {
              ...cur,
              count: cur.count + it.count,
              days: cur.days + 1,
              first: it.first < cur.first ? it.first : cur.first,
              last: it.last > cur.last ? it.last : cur.last,
              userCount: Math.max(cur.userCount, it.users.length),
            }
          : { ...it, days: 1, userCount: it.users.length },
      );
    }
  }
  const errors = [...rows.values()].sort((a, b) => b.last.localeCompare(a.last));
  const dropped = errorDays.reduce((n, d) => n + d.dropped, 0);
  const feedback = feedbackDays.flatMap((d) => d.entries).sort((a, b) => b.at.localeCompare(a.at));

  return (
    <main className="container stack">
      <AdminNav current="errors" />
      <h1>Kļūdas un ziņojumi</h1>
      <p className="small muted">
        Pēdējās {DAYS} dienas. Ieraksti tiek glabāti {KEEP_DAYS} dienas, pēc tam tie izdzēšas automātiski. Par katru jaunu kļūdu dienā
        info@medserti.lv saņem vienu e-pastu (ne vairāk kā 10 dienā). Atkārtojumi tiek saskaitīti un ierakstīti ik pēc 10 minūtēm vai kopā ar nākamo jauno kļūdu.
      </p>

      <section className="card" aria-labelledby="errors-title">
        <h2 id="errors-title">Kļūdas ({errors.length})</h2>
        {dropped > 0 && <p className="small">Vēl {dropped} gadījumi netika ierakstīti: dienas limits ir 200 dažādas kļūdas.</p>}
        {errors.length === 0 ? (
          <p className="muted">Pēdējās {DAYS} dienās kļūdu nav.</p>
        ) : (
          <div className={s.scroll}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Pēdējo reizi</th>
                  <th>Reizes</th>
                  <th>Lietotāji</th>
                  <th>Avots</th>
                  <th>Lapa</th>
                  <th>Kļūda</th>
                </tr>
              </thead>
              <tbody>
                {errors.map((e) => (
                  <tr key={e.fp}>
                    <td className={s.nowrap}>
                      {at(e.last)}
                      {e.days > 1 && <div className="small muted">{e.days} dienās, kopš {at(e.first)}</div>}
                    </td>
                    <td className={s.num}>{e.count}</td>
                    <td className={s.num}>{e.userCount || "–"}</td>
                    <td>
                      {SOURCE[e.source]}
                      {e.status != null && <div className="small muted">HTTP {e.status || "nav atbildes"}</div>}
                    </td>
                    <td><code>{e.route}</code></td>
                    <td>
                      <div className={s.msg}>{e.kind && !e.message.startsWith(e.kind) && <strong>{e.kind}: </strong>}{e.message}</div>
                      <div className="small muted">
                        {[e.frame, e.device, e.digest && `digest ${e.digest}`, `#${e.fp}`].filter(Boolean).join(" · ")}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card" aria-labelledby="feedback-title">
        <h2 id="feedback-title">Ziņojumi par problēmām ({feedback.length})</h2>
        {feedback.length === 0 ? (
          <p className="muted">Pēdējās {DAYS} dienās ziņojumu nav.</p>
        ) : (
          <ul className={s.feedback}>
            {feedback.map((f) => (
              <li key={f.id}>
                <div className="small muted">
                  {at(f.at)} · {f.email ? <a href={`mailto:${f.email}`}>{f.email}</a> : "bez e-pasta"}
                  {f.demo && " (demo)"} · {f.locale.toUpperCase()} · {f.device || "ierīce nezināma"}
                  {f.route && <> · <code>{f.route}</code></>}
                  {f.certId && <> · sertifikāts <code>{f.certId}</code></>}
                </div>
                <p className={s.msg}>{f.message}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
