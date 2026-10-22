import { useState } from "react";
import type JSZip from "jszip";
import type { Dict } from "@/lib/i18n/en";
import { finalProblem, formatPersonalCode, liveProblem } from "@/lib/export/validate";
import { Field, type FormProblem } from "./Field";
import { addCertificateFiles, saveBlob } from "./zip";
import { reportError, reportFailure } from "@/components/monitoring/report";
import { trackEvent } from "@/components/monitoring/track";

export type Kind = "name" | "personalCode" | "practitionerId" | "phone" | "email" | "text";
export type FieldSpec = { kind: Kind; required: boolean; max: number };
type Progress = { busy: boolean; done: number; total: number; msg: string | null; warn: boolean };
type Row = { id: string; date: string; title: string; fileName: string };
/** lib/export/docs.ts, loaded with docx only when the user downloads */
type Docs = typeof import("@/lib/export/docs");

const IDLE: Progress = { busy: false, done: 0, total: 0, msg: null, warn: false };

/**
 * State and actions both export forms share (doctor LĀB, nurse VI): text fields checked against `spec`,
 * errors, and the two downloads. docx and jszip load on the first click, so /export opens without them.
 */
export function useExportForm<F extends object, K extends keyof F & string>({
  spec,
  initial,
  rows,
  d,
}: {
  spec: Record<K, FieldSpec>;
  initial: () => F;
  rows: Row[];
  d: Dict["exportDocs"];
}) {
  const [f, setF] = useState<F>(initial);
  const [errors, setErrors] = useState<Record<string, FormProblem>>({});
  const [formError, setFormError] = useState(false);
  const [state, setState] = useState<Progress>(IDLE);
  const [files, setFiles] = useState<Progress>(IDLE);

  const setErr = (k: string, p: FormProblem | null) =>
    setErrors((e) => {
      const n = { ...e };
      if (p) n[k] = p;
      else delete n[k];
      return n;
    });

  const set = <P extends keyof F>(k: P, v: F[P]) => {
    setF((prev) => ({ ...prev, [k]: v }));
    const s = (spec as Partial<Record<keyof F, FieldSpec>>)[k];
    // wrong characters show red at once; missing or incomplete values only after "Download"
    setErr(String(k), s && s.kind !== "email" && s.kind !== "text" ? liveProblem(s.kind, String(v)) : null);
  };

  /** Problems of the spec'd text fields; the view adds its own checks before report() */
  const checkFields = () => {
    const e: Record<string, FormProblem> = {};
    for (const k of Object.keys(spec) as K[]) {
      const p = finalProblem(spec[k].kind, String(f[k]), spec[k].required, spec[k].max);
      if (p) e[k] = p;
    }
    return e;
  };

  /** Show the problems and move to the first one; true when there are none */
  const report = (e: Record<string, FormProblem>) => {
    setErrors(e);
    const first = Object.keys(e)[0];
    setFormError(!!first);
    if (first) {
      const el = document.getElementById(first);
      el?.focus();
      el?.scrollIntoView({ block: "center" });
    }
    return !first;
  };

  /** One spec'd text input with label, hint and error */
  const textField = (k: K, label: string, placeholder: string, extra: { hint?: string; auto?: string; mode?: "numeric" | "tel" | "email"; wide?: boolean } = {}) => (
    <Field id={k} label={label} required={spec[k].required} hint={extra.hint} wide={extra.wide} problem={errors[k]} d={d}>
      <input
        id={k}
        value={String(f[k])}
        onChange={(e) => set(k, (spec[k].kind === "personalCode" ? formatPersonalCode(e.target.value) : e.target.value) as F[K])}
        placeholder={placeholder}
        maxLength={spec[k].max}
        required={spec[k].required}
        autoComplete={extra.auto ?? "off"}
        inputMode={extra.mode}
        aria-invalid={!!errors[k] || undefined}
        aria-describedby={errors[k] ? `${k}-err` : undefined}
      />
    </Field>
  );

  /** Build the document ZIP: `fill` adds the files and returns how many certificate files failed */
  async function build(folder: string, fill: (zip: JSZip, docs: Docs, onProgress: (done: number) => void) => Promise<number>) {
    setState({ busy: true, done: 0, total: rows.length, msg: null, warn: false });
    try {
      const [{ default: JSZip }, docs] = await Promise.all([import("jszip"), import("@/lib/export/docs")]);
      const zip = new JSZip();
      const failed = await fill(zip, docs, (done) => setState((st) => ({ ...st, done })));
      saveBlob(await zip.generateAsync({ type: "blob" }), `${folder}.zip`);
      setState({ busy: false, done: rows.length, total: rows.length, msg: failed ? d.failed : d.done, warn: failed > 0 });
      if (failed) reportFailure("exportDocsFiles", null);
      trackEvent("Export downloaded", { kind: "documents" });
    } catch (err) {
      console.error("export failed", err);
      reportError({ source: "client", kind: "exportDocs", message: err instanceof Error ? err.message : err, stack: err instanceof Error ? err.stack : undefined });
      setState({ ...IDLE, msg: d.buildFailed, warn: true });
    }
  }

  /** Only the certificate files, no personal details needed */
  async function downloadFiles() {
    setFiles({ busy: true, done: 0, total: rows.length, msg: null, warn: false });
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      const folder = "Medserti_sertifikati";
      const failed = await addCertificateFiles(zip, folder, rows, (done) => setFiles((st) => ({ ...st, done })));
      saveBlob(await zip.generateAsync({ type: "blob" }), `${folder}.zip`);
      setFiles({ busy: false, done: rows.length, total: rows.length, msg: failed ? d.failed : d.filesDone, warn: failed > 0 });
      if (failed) reportFailure("exportFiles", null);
      trackEvent("Export downloaded", { kind: "files" });
    } catch (err) {
      console.error("certificate files export failed", err);
      reportError({ source: "client", kind: "exportFiles", message: err instanceof Error ? err.message : err, stack: err instanceof Error ? err.stack : undefined });
      setFiles({ ...IDLE, msg: d.buildFailed, warn: true });
    }
  }

  return { f, set, errors, setErr, formError, checkFields, report, textField, state, files, build, downloadFiles };
}
