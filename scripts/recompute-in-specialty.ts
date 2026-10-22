/**
 * One-off: clear "own specialty" on certificates the old matcher ticked by mistake (code review L1, PR #29).
 *
 * Before PR #29 the matcher looked for the first 5 letters of each specialty word anywhere in the text, so
 * "Internists" matched "International" and inSpecialty was saved as true on the wrong certificates.
 * This script re-runs the new matcher on title + organizer and changes a certificate only when all hold:
 *   - status is "needs_review" and fieldConfidence is still set (the user has not saved it)
 *   - the stored value is true and the new matcher says false
 *   - the user's profile specialty is on the LĀB list (free text and empty specialties are skipped)
 * It never sets false to true and never touches confirmed, failed or user-saved certificates, the demo
 * account or nurses (their rules do not use inSpecialty).
 *
 * Dry run by default: prints what would change. --apply writes each change through lib/db , after saving the old records as JSON in --backup-dir.
 *
 * Run from the app folder (local store: ./.data-records.json; production: set KV_REST_API_URL + KV_REST_API_TOKEN):
 *   npx tsx --conditions=react-server scripts/recompute-in-specialty.ts
 *   npx tsx --conditions=react-server scripts/recompute-in-specialty.ts --apply [--backup-dir "../Working for Claude"]
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { listRecordKeys } from "../lib/records";
import { getCertificate, getUser, listCertificates, saveCertificate } from "../lib/db";
import { DEMO_USER_ID } from "../lib/demo/id";
import { matchesSpecialty } from "../lib/parse/specialty";
import { findSpecialty, specialtyByCode } from "../lib/specialties";
import type { CmeCertificate } from "../lib/types";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const i = args.indexOf("--backup-dir");
const backupDir = path.resolve(i >= 0 && args[i + 1] ? args[i + 1] : "../Working for Claude");
// the backup holds personal data: never inside the repo
if (apply && (backupDir + path.sep).startsWith(process.cwd() + path.sep)) {
  console.error(`Backup dir ${backupDir} is inside the app folder; pass --backup-dir outside it.`);
  process.exit(1);
}

/** Would the new matcher clear this certificate's "own specialty" tick? */
function shouldClear(c: CmeCertificate, specialty: string): boolean {
  if (c.status !== "needs_review" || !c.fieldConfidence || c.inSpecialty !== true) return false;
  return !matchesSpecialty(`${c.title}\n${c.organizer}`, specialty);
}

async function main() {
  const userIds = [...new Set((await listRecordKeys("users/")).map((p) => /^users\/([0-9a-f-]{36})\/user\.json$/i.exec(p)?.[1]).filter((id): id is string => !!id))];

  const counts = { users: 0, skippedUsers: 0, certificates: 0, eligible: 0, change: 0 };
  const skipped: string[] = [];
  const changes: { before: CmeCertificate; specialty: string }[] = [];

  for (const id of userIds) {
    if (id === DEMO_USER_ID) continue;
    const user = await getUser(id);
    if (!user) continue;
    counts.users++;
    const p = user.profile;
    const listed = specialtyByCode(p.specialtyCode) ?? findSpecialty(p.specialty);
    if (p.profession === "nurse" || !listed) {
      counts.skippedUsers++;
      skipped.push(`${id}: ${p.profession === "nurse" ? "nurse" : p.specialty.trim() ? "specialty not on the list" : "no specialty"}`);
      continue;
    }
    for (const c of await listCertificates(id)) {
      counts.certificates++;
      if (c.status === "needs_review" && c.fieldConfidence && c.inSpecialty) counts.eligible++;
      if (shouldClear(c, listed.lv)) changes.push({ before: c, specialty: listed.lv });
    }
  }
  counts.change = changes.length;

  console.log(apply ? "APPLY" : "DRY RUN (pass --apply to write)");
  console.log(`users scanned: ${counts.users}, skipped: ${counts.skippedUsers}`);
  for (const s of skipped) console.log(`  skipped ${s}`);
  console.log(`certificates checked: ${counts.certificates}`);
  console.log(`needs_review, unsaved, own specialty ticked: ${counts.eligible}`);
  console.log(`would change true -> false: ${counts.change}`);
  for (const { before: c, specialty } of changes) console.log(`  ${c.userId}/${c.id} [${specialty}] "${c.title.slice(0, 100)}" | ${c.organizer.slice(0, 60)}`);

  if (apply && changes.length) {
    await mkdir(backupDir, { recursive: true });
    const file = path.join(backupDir, `in-specialty-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    await writeFile(file, JSON.stringify(changes.map((x) => x.before), null, 1));
    console.log(`backup of ${changes.length} records: ${file}`);
    let written = 0;
    for (const { before } of changes) {
      // the user may have saved it since the scan: then their record wins
      const now = await getCertificate(before.userId, before.id);
      if (!now || JSON.stringify(now) !== JSON.stringify(before)) {
        console.log(`  changed since the scan, left alone: ${before.userId}/${before.id}`);
        continue;
      }
      await saveCertificate({ ...before, inSpecialty: false });
      written++;
    }
    console.log(`written: ${written}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
