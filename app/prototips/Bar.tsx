import Link from "next/link";
import s from "./pieslegties/proto.module.css";

/** Prototype switcher (branch login-panel-prototypes, never merged) */
export default function Bar({ title, links, active }: { title: string; links: { href: string; label: string; key: string }[]; active: string }) {
  return (
    <div className={s.bar}>
      <strong>Prototips · {title}</strong>
      {links.map((l) => (
        <Link key={l.key} href={l.href} className={l.key === active ? s.barOn : undefined} scroll={false}>{l.label}</Link>
      ))}
    </div>
  );
}
