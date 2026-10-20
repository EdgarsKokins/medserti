# Medserti

Web app for Latvian medical practitioners to track continuing education points (TIP) toward recertification.

Live: https://medserti.lv (also https://medserti.vercel.app)

## What it does

- **Profile**: profession, specialty, current certificate dates. The required points follow Cabinet Regulation No. 391 (amended 25 Nov 2025): 250 TIP for doctors/dentists/functional specialists, 150 for other professions, 100 for methods, over a 5-year certificate.
- **Certificates**: upload PDFs or photos. PDFs are read with `unpdf` on the server, photos with `tesseract.js` OCR in the browser (Latvian + English), then a rule-based extractor (`lib/parse.ts`) pulls out title, organizer, dates, TIP, hours, country and category per Annex 4. Every certificate is confirmed by the user.
- **Dashboard**: progress toward the requirement, the 60% specialty share, 8 TIP emergency care incl. 4 practical hours, 16% cap on practical training, a points-over-time chart with forecast.
- **Courses** (`/courses`): upcoming TIP events aggregated daily from the LĀB approved TIP list, LĀB courses, kursiarstiem.lv, medicinaskursi.lv and LUMPII (lumpii.lv). Facts plus a link back to the source; contact persons' details are not stored.
- Latvian UI by default, English switch.

No paid APIs. Hosting is Vercel (Hobby), data and files in a private Vercel Blob store.

## Stack

Next.js 16 (App Router), React 19, TypeScript, zod, `@vercel/blob`, `jose` + `bcryptjs` for cookie auth, `unpdf`, `tesseract.js`.

## Layout

| Path | What |
|---|---|
| `lib/rules.ts` | Recertification rules and `computeProgress` |
| `lib/parse.ts` | Certificate text extractor (Annex 4 logic) |
| `lib/courses/` | Course scrapers, merge, daily refresh, lecture programmes |
| `lib/i18n.ts` | LV/EN dictionary |
| `lib/storage.ts`, `lib/db.ts` | Blob storage (or `./.data` locally without a token) |
| `app/` | Pages and API routes; `app/api/cron/refresh-courses` runs daily (see `vercel.json`) |
| `components/` | UI by feature |

## Run locally

```bash
npm install
npm run dev
```

Without `BLOB_READ_WRITE_TOKEN` the app stores everything in `./.data`, so you can run it with no accounts or keys. To use the real store, link the Vercel project and pull env vars (`vercel env pull .env.local`).

Env vars in production: `AUTH_SECRET`, `BLOB_READ_WRITE_TOKEN`, `CRON_SECRET`, `ADMIN_EMAILS`.

`ADMIN_EMAILS` is a comma-separated list of account emails that may open the text editor at `/admin` (e.g. `edgars@example.com,matiss@example.com`). Everyone else, signed in or not, gets a 404 there. Unset means nobody.

## Editing texts

Admins can change any UI text, LV and EN, at `/admin` without a deploy. Edits are stored as overrides in the Blob store (`i18n/overrides.json`, the version before the last save in `i18n/overrides.prev.json`) and reach every page within a minute. The code dictionaries in `lib/i18n.ts` and `components/courses/strings.ts` stay the defaults. Texts with plural forms or conditions are read-only there and are changed in code.

## Deploying

The Vercel project is connected to this repo: every push to `main` deploys to production (https://medserti.vercel.app). Pushes to other branches get a preview URL.
