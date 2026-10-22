import "server-only";

/*
 * Rate limit in server memory, per instance: free (no Blob operations), but each instance counts on its own,
 * so the real limit is a few times higher. Meant for cheap, high-volume endpoints (error reports); anything that must
 * hold across instances keeps its count in storage (feedback per user in the day file, rateLimit in lib/password-reset).
 */
type Hits = Map<string, number[]>;
const hits: Hits = ((globalThis as { __medsertiHits?: Hits }).__medsertiHits ??= new Map());

/** True when the action is allowed: fewer than max hits for this key within windowMs */
export function allowHit(key: string, max: number, windowMs: number, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => t > now - windowMs);
  if (hits.size > 5_000) hits.clear();
  if (recent.length >= max) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}
