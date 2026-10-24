# Medserti: working context for Claude Code

Medserti (https://medserti.lv) is a free web app for Latvian medical practitioners. They upload continuing-education certificates (PDF or photo), the app reads them and counts TIP against the recertification rules, lists TIP-approved courses, and builds the LĀB recertification documents. Founders: Edgars Kokins (product, owner of all accounts) and Matīss Kokins. Pilot stage: real doctors are about to test it.

## How we work

- **Never push to `main`.** Work on a branch, push it, open a PR. `main` is protected: the CI check "Typecheck, tests, build" must pass. Edgars approves every merge; do not merge unless he says so.
- Push finished work to its branch even if it is not ready to merge.
- PR descriptions: what changed and why, a short table for before/after numbers, what was tested and what was not. End with the Claude Code attribution line.
- Before saying something works, verify it: run the tests, build, and check the page. Say plainly what you could not verify.
- Ask before any rule or product decision that is not clear-cut (TIP rules, what counts as what). Quote the regulation clause you rely on.

## Hard rules

- **Free tools only.** No LLM calls, no paid APIs. Certificate reading is rule-based on purpose (cost and privacy).
- **Never run scripts or tests against production storage** (Vercel Blob or Upstash Redis). Hobby Blob allows 10,000 simple and 2,000 advanced operations a month and the site is paused at 100%; Redis free tier is 500K commands a month. Local dev and tests use local storage automatically (no env vars needed).
- **Real certificates contain personal data.** Never commit them or text extracted from them. They live outside the repo in `../Working for Claude/parse-samples`. Fixtures in `tests/` are synthetic only.
- **The personal code (personas kods), address and workplaces never reach the server.** The export is built in the browser (`components/export`, `lib/export`).
- **Zero silently wrong values.** A doubtful field is flagged for the user, never guessed. Auto-confirm only for born-digital PDFs with printed points and every key field sure (`lib/parse/confidence.ts`). Scans and photos always need the user.
- The demo account (`lib/demo`) is read-only; every write route goes through `requireWritableUser`.
- Secrets never go in code, commits, logs or chat. Env vars on Vercel are production-only and sensitive where marked.

## Rules the app implements

Cabinet Regulation No. 391 (as amended by No. 703, 2025, and No. 487, Aug 2026), `lib/rules.ts`:
- 250 TIP per 5 years for doctors, dentists, functional specialists; 150 for other professions (and for functional specialists other than physiotherapists whose certificate ends before 01 Jan 2028); 100 for a method certificate.
- At least 60% in the own specialty, at least 8 TIP emergency care incl. 4 practical hours, practical training counted up to 16%. A certificate is valid 5 years (point 6).
- Nurses are not certified: they re-register with Veselības inspekcija on 100 academic hours (Reg. 630), with topic minimums from 2027 (`lib/nurse.ts`).
- Courses abroad: points as set by the organizer, 1 TIP = 45 minutes; the estimator is conservative (`lib/abroad.ts`).

## Code map

| Path | What |
|---|---|
| `app/` | Pages (LV routes: `/privatums`, `/noteikumi`, `/kontakti`, `/par-mums`) and API routes |
| `app/api/cron/` | `refresh-courses` (daily 04:00 UTC), `backup` (Sunday 01:00 UTC), `migrate-records` (one-off); all need `Authorization: Bearer $CRON_SECRET` |
| `lib/rules.ts` | Requirements and `computeProgress` |
| `lib/parse/` | Certificate reading: text, OCR, dates, points, title, organizer, place, specialty, image quality, confidence, LĀB TIP lookup |
| `lib/records.ts`, `lib/db.ts` | JSON records in Upstash Redis (local file fallback). Users, certificates, settings, course index, errors, feedback |
| `lib/storage.ts` | Uploaded files in Vercel Blob (local `./.data` fallback) |
| `lib/backup.ts` | Weekly backup of files and records to Cloudflare R2 (EU), 8 weeks; restore with `scripts/restore-backup.mjs` |
| `lib/courses/` | Course scrapers (LĀB, kursiarstiem.lv, medicinaskursi.lv, lumpii.lv, LMA, evisit.eu), merge, cache |
| `lib/i18n/` | `lv.ts`, `en.ts`, `ru.ts` typed as one `Dict`; `catalog-labels.ts` labels every key for the `/admin` text editor; runtime overrides stored in Redis |
| `lib/export/`, `components/export/` | LĀB application and recertification sheet (docx in the browser) |
| `components/monitoring/` | Error log (`/admin/kludas`), "Ziņot par problēmu" reports, Vercel Analytics events |
| `tests/` | Node test runner suites; `fake-upstash.ts` runs the Redis Lua scripts locally |

## Texts and design

- Latvian is the default; every user-facing text exists in LV, EN and RU in `lib/i18n/*.ts` and has a label in `lib/i18n/catalog-labels.ts`. Exported LĀB documents are always Latvian.
- Few words, plain Latvian, formal "Jūs". Numbers use a decimal point in the UI (1.3 TIP), a comma in exported official documents.
- Design tokens in `app/globals.css` (white, cool grey, navy ink, one cobalt accent). Fonts are self-hosted in `public/fonts` (Public Sans, Schibsted Grotesk, Golos Text for Cyrillic). Light mode only. No pill shapes, no decorative "AI-looking" flourishes; many users are 60+.

## Commands

```bash
npm install
npm run dev          # http://localhost:3000, local storage, no env vars needed
npm test             # all suites (node --test with tsx)
npm run typecheck
npm run build
STORAGE_TRACE=1 npm run dev   # log every storage read/write, to measure costs
```

Env vars (names only; values live in Vercel): `AUTH_SECRET`, `CRON_SECRET`, `ADMIN_PASSWORD`, `BLOB_READ_WRITE_TOKEN`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `RESEND_API_KEY`, `BACKUP_S3_ENDPOINT`, `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY`, `BACKUP_S3_BUCKET`.

## Infrastructure

Vercel (Hobby, functions in Frankfurt) hosts the app and runs the crons; pushes to `main` deploy to production, branches get preview URLs (previews have no Redis and use temporary storage). Upstash Redis (Frankfurt) holds records, Vercel Blob holds files, Resend sends email, ImprovMX forwards info@medserti.lv, Cloudflare R2 holds backups. Data stays in the EU. Vercel Hobby is non-commercial: move to Pro before charging users.
