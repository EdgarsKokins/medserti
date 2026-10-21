# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Latvian medical practitioners who must recertify every five years under Cabinet Regulation No. 391. All professions are equally primary: doctors, dentists and functional specialists (250 TIP), and physician assistants, nurses, midwives and other practitioners (150 TIP); method certificates need 100 TIP.

Their job: keep every continuing education certificate in one place, know how many TIP they still need and which rules they have not met yet, and find approved courses that close the gap, without counting points by hand. Many users are older and not tech-savvy (from the founders' brief); they use the site on a phone or a work PC between patients.

## Product Purpose

Medserti takes recertification admin off practitioners' hands. A user uploads a certificate (PDF or phone photo), Medserti reads the date, organizer, TIP, hours and category, the user confirms it, and the dashboard shows progress against the requirement and the deadline. Success means a practitioner reaches recertification with no surprises and spends minutes, not evenings, on the paperwork.

## Positioning

One place for certificates from any organizer, read automatically and counted against the exact Regulation No. 391 rules. LĀB's own profile only counts events registered with the LĀB card; Medserti covers everything else too, and aggregates upcoming TIP-approved courses from LĀB, LUMPII, kursiarstiem.lv and medicinaskursi.lv with how to apply.

Medserti is independent. It is not affiliated with or endorsed by LĀB and must never imply that it is. It is open to partnering with LĀB later. It does not replace official recertification: the user applies as usual and the certification body decides.

## Operating Context

- Rules: Cabinet Regulation No. 391 (amended 25 Nov 2025), point 51 and Annex 4: required TIP by profession, at least 60% from the specialty, 8 TIP emergency care incl. 4 practical hours, 16% cap on practical training, 5-year certificate period.
- Documents: certificates of attendance in Latvian or English, as PDF or photo, from LĀB, specialty associations, universities and foreign events.
- Courses list refreshed daily from public sources; facts plus a link back. Where LĀB publishes a registration contact (organizer's contact person, email, phone), we show it as published in "Kā pieteikties".
- Founders: Matīss Kokins (medical services consulting) and Edgars Kokins (healthtech). Their mother is a doctor.

## Capabilities and Constraints

- Profile (profession, specialty, certificate dates), certificate upload with PDF text extraction and in-browser OCR (Latvian + English), user review and confirmation of every certificate, dashboard with rule checks and a points-over-time chart, course aggregator, LV/EN UI (Latvian default), light/dark theme.
- No paid APIs. Certificates are read on the server or in the browser, never sent to outside reading services. Files stay in private storage visible only to the owner.
- Stack is fixed by the codebase: Next.js App Router, React, TypeScript, CSS modules, Vercel hosting.
- Undecided: pricing after the pilot. Pages say only "free during the pilot, no card needed". No future price claims.
- Undecided: any LĀB partnership.

## Brand Commitments

- Name: Medserti. Domain medserti.lv.
- Voice: plain, direct, short sentences, no jargon. Latvian first, English second.
- Founder story ("two brothers, a doctor for a mum") and real founder photos (`public/team/edgars.jpg`, `public/team/matiss.jpg`).

## Evidence on Hand

- Live product at https://medserti.lv.
- Founder photos and story (`components/About.tsx`, `lib/i18n.ts`).
- Live course count from the aggregator.
- None yet: user numbers, testimonials, partner logos, press, endorsements. Do not fabricate any of them.

## Product Principles

1. The rules are the product. Every number shown traces to Regulation No. 391, cited in plain words.
2. The user stays in control. Nothing read automatically counts until the user confirms it.
3. Built for the least technical user. If a step needs explaining, simplify the step.
4. Honest about what we are. Independent, free during the pilot, not a substitute for the certification body.
5. Privacy by default. Certificates are personal records; no outside processing, no selling data.

## Accessibility & Inclusion

Older and less tech-savvy users are a known part of the audience: large readable text, clear labels, generous tap targets, no reliance on hover or gestures, and every action reachable on a phone. Full Latvian coverage is required; English is the second language.
