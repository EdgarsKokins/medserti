import { track } from "@vercel/analytics";

/*
 * Funnel events for Vercel Web Analytics (cookieless). Event properties never hold personal data:
 * only fixed words like the export kind. Custom events show in the dashboard on Vercel Pro; on Hobby they are dropped.
 */
export type FunnelEvent =
  | "Signup completed"
  | "Profile completed"
  | "First certificate uploaded"
  | "Certificate confirmed"
  | "Export downloaded"
  | "Problem reported";

export function trackEvent(name: FunnelEvent, props?: Record<string, string>): void {
  try {
    track(name, props);
  } catch {
    // analytics never breaks the page
  }
}
