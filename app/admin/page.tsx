import type { Metadata } from "next";
import Link from "next/link";
import { isAdmin } from "@/lib/admin";
import { BLOCKS, catalog, emptyOverrides } from "@/lib/i18n/catalog";
import { LOCALES } from "@/lib/i18n";
import { readPreviousOverrides, readStoredOverrides } from "@/lib/i18n/overrides-server";
import TranslationsAdmin from "@/components/admin/TranslationsAdmin";
import AdminLogin from "@/components/admin/AdminLogin";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Tekstu redaktors", robots: { index: false, follow: false } };

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ demoReset?: string }> }) {
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
  const saved = emptyOverrides();
  const stale: string[] = [];
  for (const l of LOCALES) {
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
      {/* admin tools stay in Latvian like the editor above; the demo account is lib/demo */}
      <section className="card" style={{ marginTop: 40 }} aria-labelledby="errors-link">
        <h2 id="errors-link">Kļūdas un ziņojumi</h2>
        <p className="small muted">Servera un pārlūka kļūdas un „Ziņot par problēmu” ziņojumi par pēdējām 7 dienām.</p>
        <Link href="/admin/kludas" className="btn">Atvērt kļūdu sarakstu</Link>
      </section>
      <section className="card" style={{ marginTop: 40 }} aria-labelledby="demo-reset">
        <h2 id="demo-reset">Demo konts</h2>
        <p className="small muted">
          Publiskais demo konts (Jānis Paraugs) ir tikai lasāms. Poga to izdzēš un izveido no jauna ar sākotnējiem datiem.
        </p>
        <form action="/api/admin/demo-reset" method="post" className="row">
          <button className="btn" type="submit">Atjaunot demo kontu</button>
          {(await searchParams).demoReset && <span className="badge badge-ok">Demo konts atjaunots</span>}
        </form>
      </section>
    </main>
  );
}
