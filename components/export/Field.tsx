import type { Dict } from "@/lib/i18n/en";
import type { Problem } from "@/lib/export/validate";
import s from "./export.module.css";

/** Every problem an export form can show next to a field */
export type FormProblem = Problem | "file" | "fileSize" | "declarations";

type Strings = Dict["exportDocs"];

export function problemText(p: FormProblem | undefined, d: Strings): string | null {
  switch (p) {
    case "required": return d.required;
    case "letters": return d.errLetters;
    case "digits": return d.errDigits;
    case "personalCode": return d.errPersonalCode;
    case "practitionerId": return d.errPractitionerId;
    case "phone": return d.errPhone;
    case "email": return d.errEmail;
    case "tooLong": return d.errTooLong;
    case "file": return d.languageFileMissing;
    case "fileSize": return d.languageFileTooBig;
    case "declarations": return d.declarationsRequired;
    default: return null;
  }
}

/** Field label with the "*" for required fields */
export function Label({ htmlFor, text, required }: { htmlFor: string; text: string; required: boolean }) {
  return (
    <label htmlFor={htmlFor}>
      {text}
      {required && <span className={s.req} aria-hidden="true"> *</span>}
    </label>
  );
}

/** The red line under a field; its id is what aria-describedby points to */
export function FieldError({ id, problem, d }: { id: string; problem: FormProblem | undefined; d: Strings }) {
  return problem ? (
    <span id={`${id}-err`} className={s.err} role="alert">
      {problemText(problem, d)}
    </span>
  ) : null;
}

/** Label, control, optional hint and error in one grid cell; wide spans both columns of the personal-details grid */
export function Field({
  id,
  label,
  required,
  hint,
  wide,
  problem,
  d,
  children,
}: {
  id: string;
  label: string;
  required: boolean;
  hint?: string;
  wide?: boolean;
  problem: FormProblem | undefined;
  d: Strings;
  children: React.ReactNode;
}) {
  return (
    <div className={wide ? `field ${s.wide}` : "field"}>
      <Label htmlFor={id} text={label} required={required} />
      {children}
      {hint && <span className="small muted">{hint}</span>}
      <FieldError id={id} problem={problem} d={d} />
    </div>
  );
}
