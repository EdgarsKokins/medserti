/**
 * One-off: copy every JSON record from Vercel Blob into Redis (lib/records.ts). Uploaded files stay in Blob.
 *
 * - Lists the Blob store once and reads each JSON record once (one simple operation each). Nothing in Blob is
 *   written or deleted: the old JSON blobs stay until cleanup is approved, so a rollback only needs the old code.
 * - Each record is written to Redis with a compare-and-set and read back to verify it.
 * - Resumable and idempotent: a state file remembers the Blob version and the value written for every record. A rerun
 *   reads from Blob only what changed since (new, edited, deleted), so running it again right after the deploy picks
 *   up writes made in between at the cost of those records only. A record that changed in Redis since this script
 *   wrote it is never overwritten or deleted: it is reported as a conflict.
 *
 * Mapping (keys mirror the Blob paths):
 *   users/<id>/user.json, users/<id>/demo.json, users/index/<h>.json, courses/index.json, i18n/*.json -> same key
 *   users/<id>/certs/<certId>.json  -> field <certId> of the hash users/<id>/certs; when users/<id>/certs.json (the
 *                                      manifest) exists, only certificates it lists (the app never showed the others)
 *   users/<id>/certs.json           -> not copied (the hash replaces it)
 *   courses/details/<ref>.json      -> same key, expiring 14 days after fetchedAt
 *   reset-tokens/<h>.json           -> same key, expiring at expiresAt (expired ones skipped)
 *   errors/<day>.json, feedback/<day>.json -> same key, expiring 31 days after the day (older ones skipped)
 *   rate-limits/*                   -> skipped: counters reset (new format, windows of an hour or a day)
 *   users/<id>/files/**             -> skipped: files stay in Blob, not read
 *
 * Source: the Blob store of BLOB_READ_WRITE_TOKEN, or without it the local ./.data folder.
 * Target: Redis from KV_REST_API_URL + KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_*), or without them ./.data-records.json.
 *
 * Run from the app folder:
 *   npx tsx --conditions=react-server scripts/migrate-blob-to-redis.ts --dry-run   list once and count, no reads
 *   npx tsx --conditions=react-server scripts/migrate-blob-to-redis.ts             local .data -> local records file
 *   npx tsx --conditions=react-server scripts/migrate-blob-to-redis.ts --yes       production (Blob token + Redis env)
 * Options: --state <file> (default ./.migrate-blob-to-redis.state.json), --verbose
 */
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { list, get } from "@vercel/blob";
import { deleteRaw, getRaw, recordsBackend, setRawIfEquals } from "../lib/records";
import { DAY_TTL_SEC } from "../lib/monitoring/day";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const verbose = args.includes("--verbose");
const si = args.indexOf("--state");
const stateFile = path.resolve(si >= 0 && args[si + 1] ? args[si + 1] : ".migrate-blob-to-redis.state.json");
const useBlob = !!process.env.BLOB_READ_WRITE_TOKEN;
const LOCAL_ROOT = path.join(process.cwd(), ".data");

if (useBlob && !dryRun) {
  if (recordsBackend() !== "redis") {
    console.error("Reading the production Blob store needs a Redis target: set KV_REST_API_URL + KV_REST_API_TOKEN (or use --dry-run).");
    process.exit(1);
  }
  if (!args.includes("--yes")) {
    console.error("This reads every JSON record from the production Blob store (one simple operation each). Pass --yes to run.");
    process.exit(1);
  }
}

const COURSE_DETAILS_KEEP_SEC = 14 * 86_400; // as app/api/courses/details/route.ts: twice its 7-day MAX_AGE
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const ops = { blobList: 0, blobGet: 0, redis: 0 };

/* ---------- source ---------- */

type Listed = { path: string; version: string };

async function listSource(): Promise<Listed[]> {
  if (useBlob) {
    const out: Listed[] = [];
    let cursor: string | undefined;
    do {
      ops.blobList++;
      const page = await list({ cursor, limit: 1000 });
      out.push(...page.blobs.map((b) => ({ path: b.pathname, version: `${new Date(b.uploadedAt).getTime()}:${b.size}` })));
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return out;
  }
  ops.blobList++;
  const entries = await fs.readdir(LOCAL_ROOT, { recursive: true, withFileTypes: true }).catch(() => []);
  return Promise.all(
    entries
      .filter((e) => e.isFile())
      .map(async (e) => {
        const f = path.join(e.parentPath, e.name);
        const st = await fs.stat(f);
        return { path: path.relative(LOCAL_ROOT, f).split(path.sep).join("/"), version: `${st.mtimeMs}:${st.size}` };
      }),
  );
}

async function readSource(p: string): Promise<string | null> {
  ops.blobGet++;
  if (useBlob) {
    const res = await get(p, { access: "private", useCache: false });
    if (!res || res.statusCode !== 200) return null;
    return Buffer.from(await new Response(res.stream).arrayBuffer()).toString("utf8");
  }
  return fs.readFile(path.join(LOCAL_ROOT, p), "utf8").catch(() => null);
}

/* ---------- mapping ---------- */

type Kind = "user" | "emailIndex" | "demo" | "cert" | "manifest" | "courseIndex" | "courseDetails" | "i18n" | "resetToken" | "errors" | "feedback" | "rateLimit" | "file" | "other" | "notJson";
type Target = { key: string; field: string | null };

const UUID = "[0-9a-f-]{36}";
function classify(p: string): { kind: Kind; target?: Target } {
  let m: RegExpExecArray | null;
  if (new RegExp(`^users/${UUID}/files/`, "i").test(p)) return { kind: "file" };
  if ((m = new RegExp(`^users/(${UUID})/certs/([^/]+)\\.json$`, "i").exec(p))) return { kind: "cert", target: { key: `users/${m[1]}/certs`, field: m[2] } };
  if (new RegExp(`^users/${UUID}/certs\\.json$`, "i").test(p)) return { kind: "manifest" };
  if (!p.endsWith(".json")) return { kind: "notJson" };
  const same = { key: p, field: null };
  if (/^users\/index\/[0-9a-f]{64}\.json$/.test(p)) return { kind: "emailIndex", target: same };
  if (new RegExp(`^users/${UUID}/user\\.json$`, "i").test(p)) return { kind: "user", target: same };
  if (new RegExp(`^users/${UUID}/demo\\.json$`, "i").test(p)) return { kind: "demo", target: same };
  if (p === "courses/index.json") return { kind: "courseIndex", target: same };
  if (p.startsWith("courses/details/")) return { kind: "courseDetails", target: same };
  if (p.startsWith("i18n/")) return { kind: "i18n", target: same };
  if (p.startsWith("reset-tokens/")) return { kind: "resetToken", target: same };
  if (/^errors\/\d{4}-\d{2}-\d{2}\.json$/.test(p)) return { kind: "errors", target: same };
  if (/^feedback\/\d{4}-\d{2}-\d{2}\.json$/.test(p)) return { kind: "feedback", target: same };
  if (p.startsWith("rate-limits/")) return { kind: "rateLimit" };
  return { kind: "other", target: same };
}

/** Seconds the record should live, from its content; undefined for no expiry, 0 or less for already expired */
function ttlFor(kind: Kind, p: string, value: Record<string, unknown>, now: number): number | undefined {
  const left = (until: number) => Math.floor((until - now) / 1000);
  if (kind === "courseDetails") return left(Date.parse(String(value.fetchedAt)) + COURSE_DETAILS_KEEP_SEC * 1000);
  if (kind === "resetToken") return left(Date.parse(String(value.expiresAt)));
  if (kind === "errors" || kind === "feedback") {
    // the app sets DAY_TTL_SEC on every write during the day, so the record lives until about a day after KEEP_DAYS
    const day = p.match(/(\d{4}-\d{2}-\d{2})/)![1];
    return left(Date.parse(`${day}T23:59:59Z`) + DAY_TTL_SEC * 1000);
  }
  return undefined;
}

/* ---------- state ---------- */

type StateEntry = { version: string; key: string; field: string | null; written: string };
type State = {
  v: 1;
  records: Record<string, StateEntry>;
  /** certificate ids each manifest listed, by its Blob version: an unchanged manifest is not read again */
  manifests?: Record<string, { version: string; certs: string[] }>;
  /** expired records by Blob version: not read again */
  expired?: Record<string, string>;
};

async function loadState(): Promise<State> {
  try {
    return JSON.parse(await fs.readFile(stateFile, "utf8")) as State;
  } catch {
    return { v: 1, records: {} };
  }
}
async function saveState(s: State) {
  const tmp = `${stateFile}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(s, null, 1));
  await fs.rename(tmp, stateFile);
}

async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/* ---------- run ---------- */

async function main() {
  const started = Date.now();
  console.log(`Source: ${useBlob ? "Vercel Blob (BLOB_READ_WRITE_TOKEN)" : LOCAL_ROOT}`);
  console.log(`Target: ${recordsBackend() === "redis" ? "Redis" : path.resolve(process.env.RECORDS_FILE || ".data-records.json")}${dryRun ? " (dry run: not touched)" : ""}`);

  const listed = await listSource();
  const byKind = new Map<Kind, Listed[]>();
  for (const l of listed) {
    const k = classify(l.path).kind;
    byKind.set(k, [...(byKind.get(k) ?? []), l]);
  }
  const counts = Object.fromEntries([...byKind].map(([k, v]) => [k, v.length]));
  console.log(`Listed ${listed.length} blobs in ${ops.blobList} list call(s):`, counts);

  const state = await loadState();
  const manifests = byKind.get("manifest") ?? [];
  const candidates = listed.filter((l) => classify(l.path).target);

  if (dryRun) {
    const unchanged = candidates.filter((l) => state.records[l.path]?.version === l.version || state.expired?.[l.path] === l.version).length;
    const newManifests = manifests.filter((m) => state.manifests?.[m.path]?.version !== m.version).length;
    const reads = newManifests + candidates.length - unchanged;
    console.log(`Dry run: ${candidates.length} records to copy (${unchanged} unchanged since the last run per ${path.basename(stateFile)}).`);
    console.log(`A real run would cost about ${reads} Blob simple operations (reads, incl. ${newManifests} certificate manifests) and ${ops.blobList} advanced (list), plus about ${(candidates.length - unchanged) * 2 + unchanged} Redis commands.`);
    return;
  }

  // the manifest of each user decides which certificate records are live
  const live = new Map<string, Set<string>>();
  state.manifests ??= {};
  state.expired ??= {};
  await pool(manifests, 8, async (m) => {
    const userId = m.path.split("/")[1];
    const known = state.manifests![m.path];
    if (known?.version === m.version) return void live.set(userId, new Set(known.certs));
    const raw = await readSource(m.path);
    if (!raw) return;
    const certs = Object.keys((JSON.parse(raw) as { certs: Record<string, string> }).certs ?? {});
    state.manifests![m.path] = { version: m.version, certs };
    live.set(userId, new Set(certs));
  });

  const report = { copied: 0, unchanged: 0, verified: 0, expired: 0, orphanCerts: 0, conflicts: [] as string[], deleted: 0, errors: [] as string[] };
  const seen = new Set<string>();
  const now = Date.now();

  await pool(candidates, 8, async (l) => {
    const { kind, target } = classify(l.path);
    if (kind === "cert") {
      const userId = l.path.split("/")[1];
      if (live.has(userId) && !live.get(userId)!.has(target!.field!)) {
        report.orphanCerts++;
        return; // not in the manifest: deleted (record left behind) or a save that never completed
      }
    }
    if (state.expired![l.path] === l.version) {
      report.expired++;
      return;
    }
    seen.add(l.path);
    const prev = state.records[l.path];
    // unchanged in Blob since it was copied: Redis is the source of truth now, whatever it holds (edited or deleted)
    if (prev && prev.version === l.version) {
      report.unchanged++;
      return;
    }
    try {
      const raw = await readSource(l.path);
      if (raw === null) return; // deleted between list and read
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const value = JSON.stringify(parsed);
      const ttl = ttlFor(kind, l.path, parsed, now);
      if (ttl !== undefined && ttl <= 0) {
        state.expired![l.path] = l.version;
        seen.delete(l.path);
        report.expired++;
        return;
      }
      ops.redis++;
      const current = await getRaw(target!.key, target!.field);
      if (current === value) {
        // already there (a rerun after a lost state file): just remember it
        state.records[l.path] = { version: l.version, ...target!, written: sha(value) };
        report.unchanged++;
        return;
      }
      // changed in Blob since the last run (or new): write only over what this script wrote, or into an empty slot
      // on the first copy. Anything else was written or deleted by the new app and wins.
      const ours = prev ? current !== null && sha(current) === prev.written : current === null;
      if (!ours) {
        report.conflicts.push(`${l.path}: changed in Blob and ${current === null ? "deleted" : "changed"} in Redis since the last run; Redis kept`);
        return;
      }
      ops.redis++;
      if (!(await setRawIfEquals(target!.key, target!.field, value, current, ttl))) {
        report.conflicts.push(`${l.path}: changed in Redis during the copy; left as is`);
        return;
      }
      ops.redis++;
      if ((await getRaw(target!.key, target!.field)) !== value) throw new Error("read-back differs");
      report.verified++;
      report.copied++;
      state.records[l.path] = { version: l.version, ...target!, written: sha(value) };
      if (verbose) console.log(`  copied ${l.path}${target!.field ? ` -> ${target!.key} [${target!.field}]` : ""}${ttl ? ` (ttl ${ttl}s)` : ""}`);
    } catch (err) {
      report.errors.push(`${l.path}: ${err instanceof Error ? err.message : err}`);
    }
  });

  // copied before but gone from Blob since (deleted account or certificate): remove, if Redis still has our copy
  for (const [p, e] of Object.entries(state.records)) {
    if (seen.has(p)) continue;
    ops.redis++;
    const current = await getRaw(e.key, e.field);
    if (current !== null && sha(current) !== e.written) {
      report.conflicts.push(`${p}: gone from Blob but changed in Redis; left as is`);
      continue;
    }
    if (current !== null) {
      ops.redis++;
      await deleteRaw(e.key, e.field);
    }
    delete state.records[p];
    report.deleted++;
  }
  await saveState(state);

  console.log(
    [
      `Copied ${report.copied} records, each read back and verified (${report.verified}); ${report.unchanged} unchanged since the last run.`,
      `Skipped: ${report.expired} expired, ${report.orphanCerts} certificate records not in their manifest, ${counts.rateLimit ?? 0} rate-limit counters, ${counts.file ?? 0} files (stay in Blob).`,
      `Removed from Redis: ${report.deleted} (gone from Blob since the last run).`,
      `Cost: Blob ${ops.blobList} list (advanced) + ${ops.blobGet} reads (simple); Redis ${ops.redis} commands. ${((Date.now() - started) / 1000).toFixed(1)} s.`,
      `State: ${stateFile}`,
    ].join("\n"),
  );
  for (const c of report.conflicts) console.warn(`  conflict: ${c}`);
  for (const e of report.errors) console.error(`  error: ${e}`);
  if (report.errors.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
