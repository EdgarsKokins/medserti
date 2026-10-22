import "server-only";
import { createHash } from "crypto";
import { classifyLegacy, legacyTtl, MIGRATION_DONE_KEY, MIGRATION_STATE_KEY, type LegacyKind, type LegacyTarget } from "./legacy";
import { deleteRaw, getRaw, getRecord, setRawIfEquals, setRecord } from "./records";
import { getBytes, listVersions } from "./storage";

/**
 * Copy every JSON record from Blob into the record store (mapping: lib/legacy.ts). Used by POST
 * /api/cron/migrate-records in production and by scripts/migrate-blob-to-redis.ts locally.
 *
 * - One Blob list, then one read per JSON record. Nothing in Blob is written or deleted.
 * - Each record is written with a compare-and-set and read back to verify.
 * - The app may already have written a record (read-through or an edit since the deploy): Redis wins, always.
 *   A record goes in only where Redis has nothing, or still holds exactly what an earlier run of this wrote.
 * - Resumable: the state (each record's Blob version and the value written) is kept in the record store, saved after
 *   every run. A run that reaches `deadline` stops and returns done: false; the next call carries on. A repeat run reads
 *   from Blob only what changed since.
 * - A complete run with no errors sets MIGRATION_DONE_KEY, which ends the read-through in lib/records.ts.
 */

type StateEntry = { version: string; key: string; field: string | null; written: string };
type State = {
  v: 1;
  records: Record<string, StateEntry>;
  /** certificate ids each manifest listed, by its Blob version: an unchanged manifest is not read again */
  manifests: Record<string, { version: string; certs: string[] }>;
  /** expired records by Blob version: not read again */
  expired: Record<string, string>;
  /** records the app had already written differently, by Blob version: Redis kept, not read again */
  kept: Record<string, string>;
};

export interface MigrationReport {
  dryRun: boolean;
  /** every record handled in this run; false: call again (deadline reached) */
  complete: boolean;
  /** MIGRATION_DONE_KEY is set: the read-through is off */
  done: boolean;
  listed: number;
  byKind: Partial<Record<LegacyKind, number>>;
  /** records to copy (dry run) or still left for the next call */
  pending: number;
  copied: number;
  verified: number;
  unchanged: number;
  /** already in Redis with a different value written by the app: Redis kept */
  keptNewer: number;
  expired: number;
  orphanCerts: number;
  removed: number;
  conflicts: string[];
  errors: string[];
  cost: { blobList: number; blobReads: number; redisCommands: number };
  /** dry run: what the real run would cost */
  estimate?: { blobReads: number; blobLists: number; redisCommands: number };
  seconds: number;
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

export async function migrateBlobRecords(opts: { dryRun?: boolean; deadline?: number; verbose?: (line: string) => void } = {}): Promise<MigrationReport> {
  const started = Date.now();
  const deadline = opts.deadline ?? Infinity;
  const dryRun = !!opts.dryRun;
  const cost = { blobList: 1, blobReads: 0, redisCommands: 1 };
  const read = async (p: string) => {
    cost.blobReads++;
    const f = await getBytes(p);
    return f ? f.data.toString("utf8") : null;
  };

  // one listing (one advanced operation per 1000 blobs)
  const listed = await listVersions("");
  cost.blobList = Math.max(1, Math.ceil(listed.length / 1000));
  const byKind: Partial<Record<LegacyKind, number>> = {};
  for (const l of listed) {
    const k = classifyLegacy(l.path).kind;
    byKind[k] = (byKind[k] ?? 0) + 1;
  }
  const loaded = await getRecord<State>(MIGRATION_STATE_KEY);
  const state: State = { v: 1, records: {}, manifests: {}, expired: {}, kept: {}, ...loaded };
  const manifests = listed.filter((l) => classifyLegacy(l.path).kind === "manifest");
  const candidates = listed.filter((l) => classifyLegacy(l.path).target);

  const report: MigrationReport = {
    dryRun,
    complete: false,
    done: false,
    listed: listed.length,
    byKind,
    pending: 0,
    copied: 0,
    verified: 0,
    unchanged: 0,
    keptNewer: 0,
    expired: 0,
    orphanCerts: 0,
    removed: 0,
    conflicts: [],
    errors: [],
    cost,
    seconds: 0,
  };

  if (dryRun) {
    const known = (l: { path: string; version: string }) =>
      state.records[l.path]?.version === l.version || state.expired[l.path] === l.version || state.kept[l.path] === l.version;
    const changed = candidates.filter((l) => !known(l)).length;
    const newManifests = manifests.filter((m) => state.manifests[m.path]?.version !== m.version).length;
    report.pending = changed;
    report.unchanged = candidates.length - changed;
    report.estimate = { blobLists: cost.blobList, blobReads: newManifests + changed, redisCommands: changed * 3 + 4 };
    report.done = (await getRaw(MIGRATION_DONE_KEY, null)) !== null;
    report.seconds = (Date.now() - started) / 1000;
    return report;
  }

  // the manifest of each user decides which certificate records are live
  const live = new Map<string, Set<string>>();
  await pool(manifests, 8, async (m) => {
    const userId = m.path.split("/")[1];
    const known = state.manifests[m.path];
    if (known?.version === m.version) return void live.set(userId, new Set(known.certs));
    const raw = await read(m.path);
    if (!raw) return;
    const certs = Object.keys((JSON.parse(raw) as { certs?: Record<string, string> }).certs ?? {});
    state.manifests[m.path] = { version: m.version, certs };
    live.set(userId, new Set(certs));
  });

  const seen = new Set<string>();
  const now = Date.now();
  await pool(candidates, 8, async (l) => {
    const { kind, target } = classifyLegacy(l.path) as { kind: LegacyKind; target: LegacyTarget };
    if (kind === "cert") {
      const userId = l.path.split("/")[1];
      if (live.has(userId) && !live.get(userId)!.has(target.field!)) {
        report.orphanCerts++;
        return; // not in the manifest: deleted (record left behind) or a save that never completed
      }
    }
    seen.add(l.path);
    if (state.expired[l.path] === l.version) {
      report.expired++;
      return;
    }
    if (state.kept[l.path] === l.version) {
      report.keptNewer++;
      return;
    }
    const prev = state.records[l.path];
    // unchanged in Blob since it was copied: Redis is the source of truth now, whatever it holds (edited or deleted)
    if (prev && prev.version === l.version) {
      report.unchanged++;
      return;
    }
    if (Date.now() > deadline) {
      report.pending++;
      return;
    }
    try {
      const raw = await read(l.path);
      if (raw === null) return; // deleted between list and read
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const ttl = legacyTtl(kind, l.path, parsed, now);
      if (ttl !== undefined && ttl <= 0) {
        state.expired[l.path] = l.version;
        report.expired++;
        return;
      }
      const value = JSON.stringify(parsed);
      cost.redisCommands++;
      const current = await getRaw(target.key, target.field);
      const remember = () => (state.records[l.path] = { version: l.version, ...target, written: sha(value) });
      if (current === value) {
        // already there (written through by the app, or an earlier run whose state was lost): just remember it
        remember();
        report.unchanged++;
        return;
      }
      // write only into an empty slot, or over exactly what an earlier run wrote; anything else is the app's and wins
      if (current !== null && (!prev || sha(current) !== prev.written)) {
        if (prev) report.conflicts.push(`${l.path}: changed in Blob and in Redis since the last run; Redis kept`);
        else (state.kept[l.path] = l.version), report.keptNewer++;
        return;
      }
      if (current === null && prev) {
        report.conflicts.push(`${l.path}: changed in Blob but deleted in Redis since the last run; not restored`);
        return;
      }
      cost.redisCommands += 2;
      if (!(await setRawIfEquals(target.key, target.field, value, current, ttl))) {
        report.keptNewer++;
        return;
      }
      if ((await getRaw(target.key, target.field)) !== value) throw new Error("read-back differs");
      report.verified++;
      report.copied++;
      remember();
      opts.verbose?.(`copied ${l.path}${target.field ? ` -> ${target.key} [${target.field}]` : ""}${ttl ? ` (ttl ${ttl}s)` : ""}`);
    } catch (err) {
      report.errors.push(`${l.path}: ${err instanceof Error ? err.message : err}`);
    }
  });

  report.complete = report.pending === 0;
  // copied before but gone from Blob since (the app deletes the old copy with the record): remove if Redis still has ours
  if (report.complete) {
    for (const [p, e] of Object.entries(state.records)) {
      if (seen.has(p)) continue;
      cost.redisCommands++;
      const current = await getRaw(e.key, e.field);
      if (current !== null && sha(current) !== e.written) {
        report.conflicts.push(`${p}: gone from Blob but changed in Redis; left as is`);
        continue;
      }
      if (current !== null) {
        cost.redisCommands++;
        await deleteRaw(e.key, e.field);
      }
      delete state.records[p];
      report.removed++;
    }
  }

  cost.redisCommands++;
  await setRecord(MIGRATION_STATE_KEY, state);
  if (report.complete && !report.errors.length) {
    cost.redisCommands++;
    await setRecord(MIGRATION_DONE_KEY, { at: new Date().toISOString(), records: Object.keys(state.records).length });
  }
  report.done = (await getRaw(MIGRATION_DONE_KEY, null)) !== null;
  report.seconds = (Date.now() - started) / 1000;
  return report;
}
