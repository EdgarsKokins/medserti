# Medserti

Web app for Latvian medical practitioners to track continuing education points (TIP) toward recertification.

Live: https://medserti.lv (also https://medserti.vercel.app)

## What it does

- **Profile**: profession, specialty, current certificate dates. The required points follow Cabinet Regulation No. 391 (amended 25 Nov 2025): 250 TIP for doctors/dentists/functional specialists, 150 for other professions, 100 for methods, over a 5-year certificate.
- **Certificates**: upload PDFs or photos. PDFs are read with `unpdf` on the server, photos with `tesseract.js` OCR in the browser (Latvian + English), then a rule-based extractor (`lib/parse.ts`) pulls out title, organizer, dates, TIP, hours, country and category per Annex 4. Every certificate is confirmed by the user.
- **Dashboard**: progress toward the requirement, the 60% specialty share, 8 TIP emergency care incl. 4 practical hours, 16% cap on practical training, a points-over-time chart with forecast.
- **Courses** (`/courses`): upcoming TIP events aggregated daily from the LĀB approved TIP list, LĀB courses, kursiarstiem.lv, medicinaskursi.lv and LUMPII (lumpii.lv). Facts plus a link back to the source; contact persons' details are not stored.
- Latvian UI by default, English switch.

No paid APIs. Hosting is Vercel (Hobby). Records (accounts, certificates, settings) are in Upstash Redis (free tier, Frankfurt); uploaded files in a private Vercel Blob store.

## Stack

Next.js 16 (App Router), React 19, TypeScript, zod, `@upstash/redis`, `@vercel/blob`, `jose` + `bcryptjs` for cookie auth, `unpdf`, `tesseract.js`.

## Layout

| Path | What |
|---|---|
| `lib/rules.ts` | Recertification rules and `computeProgress` |
| `lib/parse.ts` | Certificate text extractor (Annex 4 logic) |
| `lib/courses/` | Course scrapers, merge, daily refresh, lecture programmes |
| `lib/i18n.ts` | LV/EN dictionary |
| `lib/records.ts`, `lib/db.ts` | JSON records in Redis (or `./.data-records.json` locally without Redis env vars) |
| `lib/storage.ts` | Uploaded files in Blob (or `./.data` locally without a token) |
| `lib/backup.ts` | Weekly R2 backup: Blob files plus a dump of all records; restore with `scripts/restore-backup.mjs` |
| `app/` | Pages and API routes; `app/api/cron/refresh-courses` runs daily (see `vercel.json`) |
| `components/` | UI by feature |

## Run locally

```bash
npm install
npm run dev
```

Without Redis env vars the app keeps records in `./.data-records.json`, and without `BLOB_READ_WRITE_TOKEN` files in `./.data`, so you can run it with no accounts or keys. Previews have no Redis on purpose and keep records in a temp file per instance (they start empty). `vercel env pull .env.local` can bring in the production Blob token: a dev server or script started with it reads and writes live files and uses the free-tier quota. Test locally without it.

Until the one-off migration (`POST /api/cron/migrate-records`, see `lib/migrate-records.ts`) has run, a record missing in Redis is read from its old Blob JSON and written through (`lib/records.ts`). Locally, `RECORDS_BLOB_FALLBACK=1` turns that on against `./.data`.

Env vars in production: `AUTH_SECRET`, `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (from the Upstash console, Production only; `KV_REST_API_*` also work), `BLOB_READ_WRITE_TOKEN`, `CRON_SECRET`, `ADMIN_PASSWORD`, `RESEND_API_KEY`.

Email (password reset) goes through Resend's REST API in `lib/email.ts`. Without `RESEND_API_KEY` the email, including the reset link, is printed to the server console. Optional: `EMAIL_FROM` (default `Medserti <noreply@medserti.lv>`), `EMAIL_REPLY_TO` (default `info@medserti.lv`), `SITE_URL` (base for links in emails; default `https://medserti.lv` in production, the request origin locally).

`ADMIN_PASSWORD` is the password for the text editor at `/admin` (no user account needed). Unset, admin login is disabled. Changing it signs every admin out.

## Editing texts

Admins can change any UI text, LV and EN, at `/admin` without a deploy. Edits are stored as overrides in Redis (`i18n/overrides.json`, the version before the last save in `i18n/overrides.prev.json`) and reach every page within 5 minutes. The code dictionaries in `lib/i18n.ts` and `components/courses/strings.ts` stay the defaults. Texts with plural forms or conditions are read-only there and are changed in code.

## Deploying

The Vercel project is connected to this repo: every push to `main` deploys to production (https://medserti.vercel.app). Pushes to other branches get a preview URL.
