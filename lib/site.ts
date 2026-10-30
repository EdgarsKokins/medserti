/** Base for links in emails. Never taken from the Host header in production (reset-link poisoning). */
export function siteUrl(req: Request): string {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, "");
  return process.env.NODE_ENV === "production" ? "https://medserti.lv" : new URL(req.url).origin;
}

/** Public contact address shown in the footers (an alias for now) */
export const CONTACT_EMAIL = "info@medserti.lv";
/** Public phone number, shown on /kontakti */
export const CONTACT_PHONE = "+371 25262266";
