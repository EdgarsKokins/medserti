import type { Metadata } from "next";
import { isAdmin } from "@/lib/admin";
import { BLOCKS, catalog, type StoredOverrides } from "@/lib/i18n/catalog";
import { readPreviousOverrides, readStoredOverrides } from "@/lib/i18n/overrides-server";
import TranslationsAdmin from "@/components/admin/TranslationsAdmin";
import AdminLogin from "@/components/admin/AdminLogin";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Tekstu redaktors", robots: { index: false, follow: false } };

export default async function AdminPage() {
  if (!(await isAdmin())) {
    return (
      <main className="container">
        <AdminLogin />
      </main>
    );
  }
  const [stored, prev] = await Promise.all([readStoredOverrides(), readPreviousOverrides()]);
  const { entries, byKey } = catalog();

  // edits whose text no longer exists in code, or became code-only, are kept out of the editor and dropped on the next save
  const saved: StoredOverrides = { lv: {}, en: {} };
  const stale: string[] = [];
  for (const l of ["lv", "en"] as const) {
    for (const [k, v] of Object.entries(stored[l])) {
      const cell = byKey.get(k)?.[l];
      if (cell && cell.kind !== "code") saved[l][k] = v;
      else stale.push(`${l.toUpperCase()} ${k}`);
    }
  }
  const used = new Set(entries.map((e) => e.block));
  return (
    <main className="container">
      <TranslationsAdmin
        entries={entries}
        blocks={BLOCKS.filter((b) => used.has(b.id))}
        saved={saved}
        hasPrevious={!!prev}
        stale={stale}
      />
    </main>
  );
}
