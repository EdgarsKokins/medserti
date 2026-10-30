import type { Metadata } from "next";
import Link from "next/link";
import { isAdmin } from "@/lib/admin";
import AdminLogin from "@/components/admin/AdminLogin";
import { getRecords, listRecordKeys } from "@/lib/records";
import { listCertificates } from "@/lib/db";
import { isDemoUserId } from "@/lib/demo/id";
import { profileComplete } from "@/lib/profile";
import { t } from "@/lib/i18n";
import { computeProgress } from "@/lib/rules";
import { exclusions } from "@/components/dashboard/model";
import { formatPeriod } from "@/lib/format";
import type { UserRecord } from "@/lib/types";
import s from "../kludas/kludas.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Lietotāji", robots: { index: false, follow: false } };

const when = new Intl.DateTimeFormat("lv-LV", { timeZone: "Europe/Riga", day: "2-digit", month: "2-digit", year: "numeric" });
const USER_KEY = /^users\/([^/]+)\/user\.json$/;

/**
 * Every account, newest first: who signed up, as what, and how far they got. Personal data, so admin only and no export.
 * Period, counted TIP and certificates outside the period come from the same computeProgress as the user's overview.
 * One SCAN over users/, one MGET for the accounts and one HGETALL per account for its certificates: a few dozen Redis
 * commands per view at pilot size. Admin texts stay in Latvian.
 */
export default async function UsersAdminPage() {
  if (!(await isAdmin())) {
    return (
      <main className="container">
        <AdminLogin />
      </main>
    );
  }
  const keys = (await listRecordKeys("users/")).filter((k) => USER_KEY.test(k));
  const users = (await getRecords<UserRecord>(keys))
    .filter((u): u is UserRecord => !!u && !isDemoUserId(u.id))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const certs = await Promise.all(users.map((u) => listCertificates(u.id)));
  // the same progress the user sees, so a "my points do not count" report can be checked here
  const progress = users.map((u, i) => computeProgress(u.profile, certs[i]));
  const professions = t("lv").professions;
  const complete = users.filter((u) => profileComplete(u.profile)).length;
  const withCerts = certs.filter((c) => c.length > 0).length;

  return (
    <main className="container stack">
      <p className="small"><Link href="/admin">← Tekstu redaktors</Link></p>
      <h1>Lietotāji ({users.length})</h1>
      <p className="small muted">
        Profils aizpildīts: {complete}. Ar vismaz vienu sertifikātu: {withCerts}. Demo konts nav iekļauts. Personas dati: neeksportējiet
        un nesūtiet tālāk. E-pasts atver lietotāja sertifikātus (katrs skatījums tiek reģistrēts).
      </p>
      <section className="card">
        {users.length === 0 ? (
          <p className="muted">Lietotāju vēl nav.</p>
        ) : (
          <div className={s.scroll}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>E-pasts</th>
                  <th>Vārds, uzvārds</th>
                  <th>Profesija</th>
                  <th>Specialitāte</th>
                  <th>Reģistrējies</th>
                  <th>Profils</th>
                  <th className={s.num}>Sertifikāti</th>
                  <th className={s.num}>Apstiprināti</th>
                  <th>Periods</th>
                  <th className={s.num}>TIP</th>
                  <th className={s.num}>Ārpus perioda</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u, i) => (
                  <tr key={u.id}>
                    <td className={s.nowrap}><Link href={`/admin/lietotaji/${u.id}`}>{u.email}</Link></td>
                    <td>{u.profile.fullName}</td>
                    <td>{professions[u.profile.profession] ?? u.profile.profession}</td>
                    <td>{u.profile.specialty || <span className="muted">-</span>}</td>
                    <td className={s.nowrap}>{when.format(new Date(u.createdAt))}</td>
                    <td>{profileComplete(u.profile) ? "Aizpildīts" : <span className="muted">Nav datumu</span>}</td>
                    <td className={s.num}>{certs[i].length}</td>
                    <td className={s.num}>{certs[i].filter((c) => c.status === "confirmed").length}</td>
                    <td className={s.nowrap}>{formatPeriod(progress[i].windowStart, progress[i].windowEnd, "lv")}</td>
                    <td className={`${s.num} ${s.nowrap}`}>{progress[i].total} / {progress[i].required}</td>
                    <td className={s.num}>{exclusions(progress[i]).outsideWindow || <span className="muted">0</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
