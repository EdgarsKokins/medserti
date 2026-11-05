import "server-only";
import { matchesSpecialty } from "./parse";
import type { applyTipLookup } from "./parse/tipMatch";
import { lookupTip } from "./tipRegistry";
import type { Course } from "./courses/types";
import type { CmeCertificate, RegistryEvent, TipLookup } from "./types";

/**
 * "In the specialty" without asking the doctor, who often cannot tell (Ineta Ūdra's test, November 2026): the
 * certificate's own text first, then the audience of the course it was added from, then the audience LĀB approved
 * the same event for. A course for every specialty is not counted as in the specialty: Reg. 391 point 51 asks for
 * 60% in the own specialty, and an all-specialty audience does not say that. The user can still change it.
 */
export async function decideSpecialty(
  r: Pick<ReturnType<typeof applyTipLookup>, "fields" | "content" | "tipLookup"> & { registered?: RegistryEvent[] },
  specialty: string,
  course: Course | null,
  text: string,
  lookup: typeof lookupTip = lookupTip,
): Promise<Pick<CmeCertificate, "inSpecialty" | "inSpecialtyBy">> {
  if (r.fields.inSpecialty) return { inSpecialty: true, inSpecialtyBy: "text" };
  if (!specialty) return { inSpecialty: false, inSpecialtyBy: null };
  if (course && matchesSpecialty(`${course.audience} ${course.title}`, specialty)) return { inSpecialty: true, inSpecialtyBy: "course" };
  const latvian = (r.content == null || r.content === "certificate") && !!r.fields.title && (r.fields.country == null || r.fields.country === "LV");
  if (!latvian || r.fields.category === "lecture_or_publication") return { inSpecialty: false, inSpecialtyBy: null };
  // the certificate's own approval numbers agreed with the register: those rows' audience, no more questions
  if (r.registered?.length) {
    const audience = r.registered.map((e) => e.audience ?? "").join("; ");
    return matchesSpecialty(audience, specialty) ? { inSpecialty: true, inSpecialtyBy: "registry" } : { inSpecialty: false, inSpecialtyBy: null };
  }
  // the points lookup already ran for a certificate without points; otherwise ask the register for the audience only
  const found: TipLookup | null =
    r.tipLookup ??
    (await lookup({
      title: r.fields.title,
      organizer: r.fields.organizer,
      date: r.fields.date,
      endDate: r.fields.endDate,
      dateConfidence: r.fields.fieldConfidence?.date ?? 0,
      text,
    }));
  const event = found?.status === "match" ? found.candidates[0] : null;
  return event?.audience && matchesSpecialty(event.audience, specialty)
    ? { inSpecialty: true, inSpecialtyBy: "registry" }
    : { inSpecialty: false, inSpecialtyBy: null };
}
