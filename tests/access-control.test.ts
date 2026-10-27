// Access control regressions (security audit, October 2026). A new API route or admin page without a guard fails here,
// and certificates stay readable only under their owner's id.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function walk(dir: string, name: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) walk(p, name, out);
    else if (f === name) out.push(p);
  }
  return out;
}

const rel = (p: string) => path.relative(repo, p).split(path.sep).join("/");

/** Routes anyone may call, and why */
const PUBLIC: Record<string, string> = {
  "app/api/auth/login/route.ts": "signs in; rate-limited",
  "app/api/auth/register/route.ts": "creates an account; rate-limited",
  "app/api/auth/forgot/route.ts": "same answer for every email; rate-limited",
  "app/api/auth/reset/route.ts": "needs a signed reset token",
  "app/api/auth/logout/route.ts": "clears the caller's own cookie",
  "app/api/auth/demo/route.ts": "signs in to the read-only demo account",
  "app/api/auth/demo/exit/route.ts": "leaves the demo account",
  "app/api/admin/login/route.ts": "checks the admin password; rate-limited",
  "app/api/admin/logout/route.ts": "clears the caller's own admin cookie",
  "app/api/contact/route.ts": "public contact form; rate-limited",
  "app/api/errors/route.ts": "browser error reports; rate-limited, no data returned",
};

const USER_GUARD = /requireWritableUser\(\)|currentUser\(\)|currentUserId\(\)/;

test("every API route is guarded or listed as public", () => {
  for (const file of walk(path.join(repo, "app/api"), "route.ts")) {
    const r = rel(file);
    const src = readFileSync(file, "utf8");
    if (r.startsWith("app/api/admin/") && !PUBLIC[r]) assert.match(src, /isAdmin\(\)/, `${r}: admin route without isAdmin()`);
    else if (r.startsWith("app/api/cron/")) assert.match(src, /cronAuthorized\(req\)/, `${r}: cron route without cronAuthorized()`);
    else if (!PUBLIC[r]) assert.match(src, USER_GUARD, `${r}: no sign-in check; guard it or add it to PUBLIC with a reason`);
  }
});

test("every admin page checks isAdmin() before reading data", () => {
  for (const file of walk(path.join(repo, "app/admin"), "page.tsx")) {
    const src = readFileSync(file, "utf8");
    const body = src.slice(src.indexOf("export default"));
    assert.match(body.split("\n").slice(0, 3).join("\n"), /isAdmin\(\)/, `${rel(file)}: isAdmin() must be the first check`);
  }
});

test("certificate routes look records up under the signed-in user's id only", () => {
  for (const file of walk(path.join(repo, "app/api/certificates"), "route.ts")) {
    const src = readFileSync(file, "utf8");
    for (const call of src.matchAll(/\b(getCertificate|listCertificates)\(([^,)]+)/g))
      assert.match(call[2].trim(), /^(g\.)?user\.id$/, `${rel(file)}: ${call[1]}(${call[2]}) is not scoped to the signed-in user`);
  }
});

test("user A cannot read user B's certificate by its id", async () => {
  process.chdir(mkdtempSync(path.join(tmpdir(), "medserti-acl-")));
  for (const k of ["KV_REST_API_URL", "KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "BLOB_READ_WRITE_TOKEN"])
    delete process.env[k];
  const { getCertificate, listCertificates, saveCertificate } = await import("../lib/db");
  const a = "11111111-1111-4111-8111-111111111111";
  const b = "22222222-2222-4222-8222-222222222222";
  const certId = "33333333-3333-4333-8333-333333333333";
  await saveCertificate({ id: certId, userId: b, fileName: "b.pdf", filePath: `users/${b}/files/${certId}/b.pdf` } as never);
  assert.ok(await getCertificate(b, certId));
  assert.equal(await getCertificate(a, certId), null);
  assert.equal((await listCertificates(a)).length, 0);
});
