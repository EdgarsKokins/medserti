"use client";

import { Analytics } from "@vercel/analytics/next";

/**
 * Vercel Web Analytics: cookieless page views. Query strings and fragments are dropped before anything is sent,
 * so a password reset token (/atjaunot-paroli?token=…) never leaves the page.
 */
export default function AnalyticsClient() {
  return <Analytics beforeSend={(e) => ({ ...e, url: e.url.split(/[?#]/)[0] })} />;
}
