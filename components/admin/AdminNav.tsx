import Link from "next/link";
import s from "./admin.module.css";

/** The three admin sections, on top of every admin page. Admin texts stay in Latvian. */
const SECTIONS = [
  { id: "texts", href: "/admin", title: "Teksti un tulkojumi", hint: "Lapas teksti LV, EN, RU" },
  { id: "users", href: "/admin/lietotaji", title: "Lietotāji", hint: "Konti, sertifikāti, demo konts" },
  { id: "errors", href: "/admin/kludas", title: "Kļūdas un ziņojumi", hint: "Pēdējās 7 dienas" },
] as const;

export type AdminSection = (typeof SECTIONS)[number]["id"];

export default function AdminNav({ current }: { current: AdminSection }) {
  return (
    <nav className={s.adminNav} aria-label="Administrēšana">
      {SECTIONS.map((x) => (
        <Link key={x.id} href={x.href} className={s.adminNavItem} aria-current={x.id === current ? "page" : undefined}>
          <b>{x.title}</b>
          <span>{x.hint}</span>
        </Link>
      ))}
    </nav>
  );
}
