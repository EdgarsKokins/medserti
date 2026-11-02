"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";

/** Specialty select of the public course sample: reloads the sample for the chosen specialty, keeping the scroll */
export default function SampleSpecialty({
  value,
  options,
  label,
  any,
}: {
  value: string;
  options: { code: string; label: string }[];
  label: string;
  any: string;
}) {
  const router = useRouter();
  const path = usePathname();
  const [pending, start] = useTransition();
  return (
    <label className="stack" style={{ gap: 6, maxWidth: 420 }}>
      <span className="small muted">{label}</span>
      <select
        value={value}
        aria-busy={pending || undefined}
        onChange={(e) => {
          const code = e.target.value;
          start(() => router.replace(code ? `${path}?specialitate=${encodeURIComponent(code)}` : path, { scroll: false }));
        }}
      >
        <option value="">{any}</option>
        {options.map((o) => (
          <option key={o.code} value={o.code}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}
