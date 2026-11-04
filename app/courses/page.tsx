import type { Metadata } from "next";
import { currentUser, requireUser } from "@/lib/auth";
import { DEMO_USER_ID, ensureDemo } from "@/lib/demo";
import Bar from "@/app/prototips/Bar";
import { getLocale } from "@/lib/i18n/server";
import { t } from "@/lib/i18n";
import { getUser, listCertificates } from "@/lib/db";
import { computeProgress } from "@/lib/rules";
import { matchesSpecialty } from "@/lib/parse";
import { getCourseIndex } from "@/lib/courses/store";
import { courseExtra, isNurseCourse } from "@/lib/courses/types";
import CoursesView, { type CourseRow } from "@/components/courses/CoursesView";

export const maxDuration = 60; // first visit may build the list

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await getLocale()).courses.title };
}

export default async function CoursesPage({ searchParams }: { searchParams: Promise<{ open?: string | string[]; tab?: string | string[]; proto?: string }> }) {
  const { open, tab, proto: protoParam } = await searchParams;
  // PROTOTYPE (branch login-panel-prototypes): ?proto=A|B|C tries a simpler top; signed out shows the demo account
  const proto = protoParam === "A" || protoParam === "B" || protoParam === "C" ? protoParam : null;
  let user;
  if (proto) {
    const me = await currentUser();
    if (!me) await ensureDemo();
    user = me ?? (await getUser(DEMO_USER_ID))!;
  } else user = await requireUser();
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
    <>
    {proto && (
      <Bar
        title="Kursi"
        active={proto}
        links={[
          { key: "A", href: "/courses?proto=A", label: "A · Meklēšana un birkas" },
          { key: "B", href: "/courses?proto=B", label: "B · Trīs kartītes" },
          { key: "C", href: "/courses?proto=C", label: "C · Viens teikums" },
        ]}
      />
    )}
    <CoursesView
      key={proto ?? "live"}
      proto={proto}
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
      initialKind={tab === "recorded" || tab === "ongoing" ? tab : null}
    />
    </>
  );
}
