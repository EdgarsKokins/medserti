import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { isAdmin } from "@/lib/admin";
import { adminViews, logAdminView } from "@/lib/admin-audit";
import AdminLogin from "@/components/admin/AdminLogin";
import { getUser, listCertificates } from "@/lib/db";
import { isDemoUserId } from "@/lib/demo/id";
import { computeProgress, exclusionReason, type ExclusionReason } from "@/lib/rules";
import { formatDate, formatNumber, formatPeriod } from "@/lib/format";
import { parseNoteLines } from "@/components/certificates/format";
import { t } from "@/lib/i18n";
import s from "../../kludas/kludas.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Lietotāja sertifikāti", robots: { index: false, follow: false } };

const when = new Intl.DateTimeFormat("lv-LV", { timeZone: "Europe/Riga", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

const REASON: Record<ExclusionReason, string> = {
  duplicate: "Dublikāts",
  failed: "Neizdevās nolasīt",
  processing: "Vēl apstrādā",
  noDate: "Nav datuma",
  noPoints: "Nav TIP",
  beforeWindow: "Pirms perioda",
  afterWindow: "Pēc perioda",
};

const yes = (b: boolean) => (b ? "jā" : "nē");

/**
 * One account's certificates as stored: the fields the parser read or the user entered, the parser's notes, whether
 * each counts and why not, and the original file. For support, when a certificate was read wrong (privacy policy,
 * "Piekļuve atbalstam"). Opening this page and each file is logged (lib/admin-audit.ts). Admin texts stay in Latvian.
 */
export default async function UserCertificatesAdminPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) {
    return (
      <main className="container">
        <AdminLogin />
      </main>
    );
  }
  const { id } = await params;
  const user = z.uuid().safeParse(id).success ? await getUser(id) : null;
  if (!user || isDemoUserId(user.id)) notFound();
  const certs = await listCertificates(user.id);
  await logAdminView(user.id, "certificates");
  const views = await adminViews(user.id);
  const dict = t("lv");
  const p = computeProgress(user.profile, certs);
  const ids = new Set(certs.map((c) => c.id));
  const window = { start: p.windowStart, end: p.windowEnd };

  return (
    <main className="container stack">
      <p className="small"><Link href="/admin/lietotaji">← Lietotāji</Link></p>
      <h1>{user.profile.fullName || user.email}</h1>
      <p className="small muted">
        {user.email} · {dict.professions[user.profile.profession] ?? user.profile.profession}
        {user.profile.specialty ? ` · ${user.profile.specialty}` : ""} · Periods: {formatPeriod(p.windowStart, p.windowEnd, "lv")} · Ieskaitīti{" "}
        {p.total} no {p.required} TIP
      </p>
      <p className="small muted">
        Personas dati: skatieties tikai, lai atbildētu uz lietotāja jautājumu vai izlabotu nolasīšanas kļūdu. Katrs skatījums tiek
        reģistrēts.
      </p>

      <section className="card">
        <h2>Sertifikāti ({certs.length})</h2>
        {certs.length === 0 ? (
          <p className="muted">Sertifikātu nav.</p>
        ) : (
          <div className={s.scroll}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Datums</th>
                  <th>Nosaukums, organizators</th>
                  <th className={s.num}>TIP</th>
                  <th>Kategorija</th>
                  <th>Statuss</th>
                  <th>Ieskaitīts</th>
                  <th>Nolasīšana</th>
                  <th>Fails</th>
                </tr>
              </thead>
              <tbody>
                {certs.map((c) => {
                  const reason = exclusionReason(c, ids, window);
                  const notes = parseNoteLines(c.parseNotes, dict).lines;
                  return (
                    <tr key={c.id}>
                      <td className={s.nowrap}>
                        {c.date ? formatDate(c.date, "lv") : <span className="muted">-</span>}
                        {c.endDate && c.endDate !== c.date ? ` - ${formatDate(c.endDate, "lv")}` : ""}
                      </td>
                      <td className={s.msg}>
                        {c.title || <span className="muted">(bez nosaukuma)</span>}
                        <br />
                        <span className="small muted">
                          {c.organizer || "-"}
                          {c.approvalId ? ` · ${c.approvalId}` : ""}
                          {c.country ? ` · ${c.country}` : ""}
                        </span>
                      </td>
                      <td className={s.num}>{c.points != null ? formatNumber(c.points) : <span className="muted">-</span>}</td>
                      <td className="small">
                        {dict.categories[c.category]}
                        <br />
                        <span className="muted">
                          Specialitātē: {yes(c.inSpecialty)} · NMP: {yes(c.emergencyCare)}
                          {c.practicalHours ? ` · prakt. st.: ${formatNumber(c.practicalHours)}` : ""}
                        </span>
                      </td>
                      <td className="small">
                        {dict.status[c.status]}
                        {c.autoConfirmed ? " (automātiski)" : ""}
                      </td>
                      <td className="small">{reason ? REASON[reason] : "Jā"}</td>
                      <td className="small">
                        {notes.length > 0 ? notes.join(" ") : <span className="muted">-</span>}
                        {c.tipLookup ? <span className="muted"> LĀB saraksts: {c.tipLookup.status}.</span> : null}
                        <br />
                        <span className="muted">Augšupielādēts {when.format(new Date(c.uploadedAt))}</span>
                      </td>
                      <td className="small">
                        <a href={`/api/admin/certificates/${user.id}/${c.id}/file`} target="_blank" rel="noreferrer">
                          Atvērt
                        </a>
                        <br />
                        <span className="muted">{c.fileName}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <h2>Administratora skatījumi</h2>
        <p className="small muted">Glabājas 12 mēnešus vai līdz konta dzēšanai.</p>
        <ul className="small">
          {views.slice(0, 50).map((v) => (
            <li key={v.at + v.action + (v.certId ?? "")}>
              {when.format(new Date(v.at))}: {v.action === "file" ? `atvērts fails (${v.certId?.slice(0, 8)})` : "atvērts sertifikātu saraksts"}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
