import type { CmeCertificate } from "@/lib/types";

/**
 * Merge certificates from the upload queue into the list the page shows.
 *
 * "live": certificates the server just stored while this page is open. They are the newest copy, so they win.
 * "replay": the queue's copies from before this page mounted. Those are the upload-time copies (often "needs_review"),
 * while the page's list came from the server on this render and already holds any later save. So a replayed copy only
 * fills in what the page lacks, or a row the server still listed as "parsing". It never overwrites a saved status.
 */
export function mergeStored(page: CmeCertificate[], incoming: CmeCertificate[], mode: "live" | "replay"): CmeCertificate[] {
  const take =
    mode === "live"
      ? incoming
      : incoming.filter((c) => {
          const have = page.find((p) => p.id === c.id);
          return !have || have.status === "parsing";
        });
  if (!take.length) return page;
  return [...take, ...page.filter((p) => !take.some((t) => t.id === p.id))];
}
