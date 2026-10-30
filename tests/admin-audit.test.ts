// Admin views of a user's certificates are logged, and the log goes when the account is deleted (privacy policy, support access)
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

test("admin views are logged newest first and deleted with the account", async () => {
  process.chdir(mkdtempSync(path.join(tmpdir(), "medserti-audit-")));
  for (const k of ["KV_REST_API_URL", "KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "BLOB_READ_WRITE_TOKEN"])
    delete process.env[k];
  const { adminViews, logAdminView } = await import("../lib/admin-audit");
  const { deleteUserData } = await import("../lib/db");
  const user = "44444444-4444-4444-8444-444444444444";
  const other = "55555555-5555-4555-8555-555555555555";
  const cert = "66666666-6666-4666-8666-666666666666";

  await logAdminView(user, "certificates");
  await new Promise((r) => setTimeout(r, 5));
  await logAdminView(user, "file", cert);
  await logAdminView(other, "certificates");

  const views = await adminViews(user);
  assert.equal(views.length, 2);
  assert.deepEqual([views[0].action, views[0].certId], ["file", cert]);
  assert.equal(views[1].action, "certificates");

  await deleteUserData({ id: user, email: "audit-test@example.test" } as never);
  assert.equal((await adminViews(user)).length, 0);
  assert.equal((await adminViews(other)).length, 1, "another account's log stays");
});
