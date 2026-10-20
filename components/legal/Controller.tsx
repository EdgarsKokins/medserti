import { CONTROLLER, isPlaceholder } from "@/lib/legal";
import { CONTACT_EMAIL } from "@/lib/site";
import type { Dict } from "@/lib/i18n";
import s from "./legal.module.css";

/** Controller details from lib/legal.ts; placeholders show as "to be specified" */
export default function Controller({ l }: { l: Dict["legal"] }) {
  const value = (v: string) =>
    isPlaceholder(v) ? <span className={s.pending}>{l.toBeSpecified}</span> : v;
  return (
    <dl className={s.facts}>
      <dt>{l.controllerName}</dt>
      <dd>{value(CONTROLLER.name)}</dd>
      <dt>{l.controllerRegNo}</dt>
      <dd>{value(CONTROLLER.regNo)}</dd>
      <dt>{l.controllerAddress}</dt>
      <dd>{value(CONTROLLER.address)}</dd>
      <dt>{l.controllerEmail}</dt>
      <dd><a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></dd>
    </dl>
  );
}
