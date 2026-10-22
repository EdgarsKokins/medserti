/**
 * Copy every JSON record from Blob into the record store: the same migration as POST /api/cron/migrate-records,
 * for local testing (lib/migrate-records.ts has the rules; lib/legacy.ts the mapping).
 *
 * Source: ./.data (or the Blob store of BLOB_READ_WRITE_TOKEN). Target: ./.data-records.json (or Redis from
 * UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN / KV_REST_API_*). Production runs go through the route, on the server.
 *
 * Run from the app folder:
 *   npx tsx --conditions=react-server scripts/migrate-blob-to-redis.ts --dry-run   list once and count, no reads
 *   npx tsx --conditions=react-server scripts/migrate-blob-to-redis.ts             copy, verify, report
 *   --verbose prints each record copied
 */
import { migrateBlobRecords } from "../lib/migrate-records";
import { recordsBackend } from "../lib/records";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");

if (process.env.BLOB_READ_WRITE_TOKEN && !args.includes("--yes")) {
  console.error("BLOB_READ_WRITE_TOKEN is set: this would read the production Blob store. Production runs go through POST /api/cron/migrate-records.");
  console.error("Unset it to work on ./.data, or pass --yes if you really mean it.");
  process.exit(1);
}

async function main() {
  console.log(`Source: ${process.env.BLOB_READ_WRITE_TOKEN ? "Vercel Blob" : "./.data"}  Target: ${recordsBackend() === "redis" ? "Redis" : process.env.RECORDS_FILE || "./.data-records.json"}`);
  const r = await migrateBlobRecords({ dryRun, verbose: args.includes("--verbose") ? (l) => console.log(`  ${l}`) : undefined });
  console.log(`Listed ${r.listed} blobs in ${r.cost.blobList} list call(s):`, r.byKind);
  if (r.dryRun) {
    console.log(`Dry run: ${r.pending} records to copy (${r.unchanged} unchanged since the last run).`);
    console.log(`A real run would cost about ${r.estimate!.blobReads} Blob reads (simple) and ${r.estimate!.blobLists} list (advanced), plus about ${r.estimate!.redisCommands} Redis commands.`);
    return;
  }
  console.log(
    [
      `Copied ${r.copied} records, each read back and verified (${r.verified}); ${r.unchanged} unchanged; ${r.keptNewer} already written by the app (kept).`,
      `Skipped: ${r.expired} expired, ${r.orphanCerts} certificate records not in their manifest, ${r.byKind.rateLimit ?? 0} rate-limit counters, ${r.byKind.file ?? 0} files (stay in Blob).`,
      `Removed from Redis: ${r.removed} (gone from Blob since the last run).`,
      `Cost: Blob ${r.cost.blobList} list (advanced) + ${r.cost.blobReads} reads (simple); Redis about ${r.cost.redisCommands} commands. ${r.seconds.toFixed(1)} s.`,
      `Complete: ${r.complete}${r.pending ? ` (${r.pending} left, run again)` : ""}. Read-through off (done flag set): ${r.done}.`,
    ].join("\n"),
  );
  for (const c of r.conflicts) console.warn(`  conflict: ${c}`);
  for (const e of r.errors) console.error(`  error: ${e}`);
  if (r.errors.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
