// Keeps heavy modules out of the client bundles (code review S4, S5). Follows the static value imports of every
// "use client" file; type-only imports and dynamic import() are skipped, as the bundler does.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

function resolve(from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? path.join(repo, spec.slice(2)) : spec.startsWith(".") ? path.resolve(path.dirname(from), spec) : null;
  if (!base) return null;
  for (const p of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
    if (existsSync(p) && statSync(p).isFile()) return p;
  }
  return null;
}

/** Module specifiers of the value imports and re-exports in a file */
function valueImports(src: string): string[] {
  const out: string[] = [];
  const re = /(?:^|\n)\s*(import|export)\s+([^;]*?)\s*from\s*["']([^"']+)["']|(?:^|\n)\s*import\s*["']([^"']+)["']/g;
  for (const m of src.matchAll(re)) {
    if (m[4]) {
      out.push(m[4]);
      continue;
    }
    const clause = m[2];
    if (/^type\s/.test(clause)) continue;
    const named = /^\{([^}]*)\}$/.exec(clause.trim());
    if (named && named[1].split(",").every((s) => !s.trim() || /^type\s/.test(s.trim()))) continue;
    out.push(m[3]);
  }
  return out;
}

/** Client files and every local module they pull in, with the importer that brought each one in */
function clientGraph() {
  const files = [...walk(path.join(repo, "app")), ...walk(path.join(repo, "components"))];
  // /admin edits the texts of all three languages, so its editor loads every dictionary on purpose
  const admin = [path.join(repo, "app/admin"), path.join(repo, "components/admin")];
  const roots = files.filter((f) => !admin.some((a) => f.startsWith(a + path.sep)) && /^\s*["']use client["']/.test(readFileSync(f, "utf8")));
  const seen = new Map<string, string>(roots.map((r) => [r, "(client)"]));
  const packages = new Map<string, string>();
  const queue = [...roots];
  while (queue.length) {
    const f = queue.pop()!;
    for (const spec of valueImports(readFileSync(f, "utf8"))) {
      const r = resolve(f, spec);
      if (!r) {
        if (!spec.startsWith(".") && !spec.startsWith("@/")) packages.set(spec, f);
        continue;
      }
      if (!seen.has(r)) {
        seen.set(r, f);
        queue.push(r);
      }
    }
  }
  return { seen, packages };
}

const rel = (p: string) => path.relative(repo, p);

test("client code never loads all three dictionaries", () => {
  const { seen } = clientGraph();
  const all = path.join(repo, "lib/i18n.ts");
  assert.ok(!seen.has(all), `lib/i18n.ts reaches the browser via ${rel(seen.get(all) ?? "")}; use useDict() and lib/locale.ts`);
  for (const l of ["en", "lv", "ru"]) {
    const dict = path.join(repo, `lib/i18n/${l}.ts`);
    const by = seen.get(dict);
    const loader = path.join(repo, `components/i18n/${l[0].toUpperCase()}${l[1]}Dict.tsx`);
    assert.ok(!by || by === loader, `lib/i18n/${l}.ts reaches the browser via ${rel(by ?? "")}, not only via its loader`);
  }
});

test("docx and jszip load only when an export is built", () => {
  const { seen, packages } = clientGraph();
  for (const pkg of ["docx", "jszip"]) assert.ok(!packages.has(pkg), `${pkg} is imported statically by ${rel(packages.get(pkg) ?? "")}`);
  const docs = path.join(repo, "lib/export/docs.ts");
  assert.ok(!seen.has(docs), `lib/export/docs.ts is imported statically by ${rel(seen.get(docs) ?? "")}`);
});
