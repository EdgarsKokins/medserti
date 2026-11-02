import Link from "next/link";
import s from "./prototips.module.css";

/** Prototype switcher, shown only on the prototype branch: which variant you are looking at, and the others */
export default function ProtoBar({ title, links, active }: { title: string; links: { href: string; label: string }[]; active: string }) {
  return (
    <div className={s.bar} role="navigation" aria-label="Prototipi">
      <strong>Prototips · {title}</strong>
      <span className={s.barLinks}>
        {links.map((l) => (
          <Link key={l.href} href={l.href} className={l.label === active ? s.barOn : undefined} scroll={false}>
            {l.label}
          </Link>
        ))}
      </span>
      <span className={s.barOther}>
        <Link href="/?prototips=1&hero=A">Sākumlapa</Link> · <Link href="/prototips/parskats">Pārskats</Link>
      </span>
    </div>
  );
}
