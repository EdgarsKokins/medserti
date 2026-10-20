import { requireUser } from "@/lib/auth";
import { getLocale } from "@/lib/i18n/server";
import { listCertificates } from "@/lib/db";
import { computeProgress } from "@/lib/rules";
import { matchesSpecialty } from "@/lib/parse";
import { getCourseIndex } from "@/lib/courses/store";
import CoursesView, { type CourseRow } from "@/components/courses/CoursesView";

export const maxDuration = 60; // first visit may build the list

export default async function CoursesPage() {
  const user = await requireUser();
  const locale = await getLocale();
  const [idx, certs] = await Promise.all([getCourseIndex(), listCertificates(user.id)]);
  const progress = computeProgress(user.profile, certs);
  const specialty = user.profile.specialty.trim();

  // slim rows for the client; specialty matching runs here so the parser code stays on the server
  const rows: CourseRow[] = idx.courses.map((c) => ({
    id: c.id,
    kind: c.kind,
    title: c.title,
    url: c.url,
    startDate: c.startDate,
    endDate: c.endDate,
    availableUntil: c.availableUntil,
    format: c.format,
    location: c.location,
    city: c.city,
    tip: c.tip,
    minutes: c.minutes,
    audience: c.audience,
    allSpecialties: c.allSpecialties,
    forMe: !!specialty && matchesSpecialty(`${c.audience} ${c.title}`, specialty),
    organizer: c.organizer,
    approvalId: c.approvalId,
    annexItem: c.annexItem,
    price: c.price,
    free: c.free,
    source: c.source,
    detailRef: c.detailRef ?? null,
    contact: c.contact ?? null,
  }));

  return (
    <CoursesView
      locale={locale}
      rows={rows}
      fetchedAt={idx.fetchedAt}
      sources={idx.sources}
      specialty={specialty}
      remaining={progress.remaining}
    />
  );
}
