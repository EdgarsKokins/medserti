"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Main navigation; marks the current section with aria-current so the style can underline it */
export default function NavLinks({ links, publicNav = false }: { links: { href: string; label: string }[]; publicNav?: boolean }) {
  const path = usePathname();
  return (
    <div className={publicNav ? "nav-links nav-links-public" : "nav-links"}>
      {links.map((l) => (
        <Link key={l.href} href={l.href} aria-current={path === l.href || path.startsWith(`${l.href}/`) ? "page" : undefined}>
          {l.label}
        </Link>
      ))}
    </div>
  );
}

/** Signed-out nav buttons; each one hides on its own page, where the form is right below */
export function NavAuth({ login, signup }: { login: string; signup: string }) {
  const path = usePathname();
  return (
    <>
      {path !== "/login" && <Link href="/login" className="btn">{login}</Link>}
      {path !== "/register" && <Link href="/register" className="btn btn-primary">{signup}</Link>}
    </>
  );
}
