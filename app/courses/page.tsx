import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { getLocale } from "@/lib/i18n/server";
import { t } from "@/lib/i18n";
import { listCertificates } from "@/lib/db";
import { computeProgress } from "@/lib/rules";
import { matchesSpecialty } from "@/lib/parse";
import { getCourseIndex } from "@/lib/courses/store";
import { courseExtra, isNurseCourse } from "@/lib/courses/types";
import CoursesView, { type CourseRow } from "@/components/courses/CoursesView";
import { courseStrings } from "@/components/courses/strings";

export const maxDuration = 60; // first visit may build the list

export async function generateMetadata(): Promise<Metadata> {
  return { title: courseStrings(await getLocale()).title };
}

export default async function CoursesPage({ searchParams }: { searchParams: Promise<{ open?: string | string[] }> }) {
  const user = await requireUser();
  const { open } = await searchParams;
  const locale = await getLocale();
  const [idx, certs] = await Promise.all([getCourseIndex(), listCertificates(user.id)]);
  const progress = computeProgress(user.profile, certs);
  const specialty = user.profile.specialty.trim();
  // nurses: "for me" means a course for nurses (LMA list or a nurse audience), not a doctor specialty match
  const nurse = user.profile.profession === "nurse";

  // slim rows for the client: only what the list renders and filters on. Link, venue, approval and contact load per
  // course when one is opened (/api/courses/item). Specialty matching runs here so the parser code stays on the server.
  const rows: CourseRow[] = idx.courses.map((c) => ({
    id: c.id,
    kind: c.kind,
    title: c.title,
    startDate: c.startDate,
    endDate: c.endDate,
    availableUntil: c.availableUntil,
    format: c.format,
    city: c.city,
    tip: c.tip,
    minutes: c.minutes,
    audience: c.audience,
    allSpecialties: c.allSpecialties,
    forMe: nurse ? isNurseCourse(c) : !!specialty && matchesSpecialty(`${c.audience} ${c.title}`, specialty),
    organizer: c.organizer,
    price: c.price,
    free: c.free,
    source: c.source,
  }));
  const openId = typeof open === "string" ? open : null;
  // the deep-linked course opens at once, so its details come with the page
  const linked = openId ? idx.courses.find((c) => c.id === openId) : undefined;

  return (
    <CoursesView
      locale={locale}
      rows={rows}
      fetchedAt={idx.fetchedAt}
      sources={idx.sources}
      specialty={specialty}
      remaining={progress.remaining}
      hoursUnit={nurse ? t(locale).dashboard.hoursUnit : null}
      nurse={nurse}
      openId={openId}
      openExtra={linked ? courseExtra(linked) : null}
    />
  );
}
