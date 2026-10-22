// lib/records.ts without Redis env vars on Vercel: previews keep working on a throwaway file, production refuses.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";

const repo = path.resolve(__dirname, "..");
const run = (vercelEnv: string) =>
  promisify(execFile)(
    "node",
    ["--conditions=react-server", "--import", "tsx", "-e", `import("./lib/records.ts").then(async (r) => { await r.setRecord("x/y.json", 1); console.log(await r.getRecord("x/y.json")); })`],
    {
      cwd: repo,
      encoding: "utf8",
      env: { PATH: process.env.PATH, HOME: process.env.HOME, VERCEL: "1", VERCEL_ENV: vercelEnv, TMPDIR: os.tmpdir(), NODE_ENV: "test" },
    },
  );

test("preview without Redis: works on a temp file", async () => {
  assert.equal((await run("preview")).stdout.trim(), "1");
});

test("production without Redis: refuses", async () => {
  await assert.rejects(run("production"), /UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are not set/);
});
