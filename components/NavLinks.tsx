"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Main navigation; marks the current section with aria-current so the style can underline it */
export default function NavLinks({ links }: { links: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <div className="nav-links">
      {links.map((l) => (
        <Link key={l.href} href={l.href} aria-current={path === l.href || path.startsWith(`${l.href}/`) ? "page" : undefined}>
          {l.label}
        </Link>
      ))}
    </div>
  );
}
