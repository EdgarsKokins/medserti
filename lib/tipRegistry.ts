import "server-only";
import type { RegistryEvent, TipLookup } from "./types";
import { dmy, sleep, textOf } from "./courses/util";
import { matchTip, searchTerms, type CertKeys } from "./parse/tipMatch";

/*
 * LĀB's register of approved TIP events (is.arstubiedriba.lv/tip_list_approved), searched for a certificate that prints
 * no points. The register lists every approval back to 2015 (~170 pages of 50) and has a title filter that ignores
 * diacritics, so we ask it 1-3 questions per such upload instead of copying all of it.
 * Polite: one request at a time, a short pause between them, results kept for a day per server instance.
 * Contact persons, phones and e-mails in the rows are not kept.
 */

const URL = "https://is.arstubiedriba.lv/tip_list_approved?type=all";
const USER_AGENT = "MedsertiBot/0.1 (+https://medserti.lv; looks up TIP of past events for certificates that print none)";
const TIMEOUT_MS = 8_000;
const TTL_MS = 24 * 60 * 60_000;

type Cache = Map<string, { at: number; rows: RegistryEvent[] }>;
const cache: Cache = ((globalThis as { __medsertiTipRegistry?: Cache }).__medsertiTipRegistry ??= new Map());

/** Rows of a register page: approval number, title, days, organizer, TIP, lecture-list reference */
export function parseRegistryRows(html: string): RegistryEvent[] {
  const body = html.slice(html.indexOf("<tbody"), html.lastIndexOf("</tbody>"));
  const out: RegistryEvent[] = [];
  for (const tr of body.match(/<tr>[\s\S]*?<\/tr>/g) ?? []) {
    const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
    if (cells.length !== 12) continue;
    const approvalId = textOf(cells[1]);
    if (!/^TIP\d{4}\/\d+$/.test(approvalId)) continue;
    const days = [...textOf(cells[6]).matchAll(/\d{1,2}\.\d{1,2}\.\d{4}/g)].map((m) => dmy(m[0])).filter((d): d is string => !!d);
    const tip = Number(textOf(cells[10]).replace(",", "."));
    const ref = /data-type="(application|publication)"[^>]*data-id="(\d+)"/.exec(cells[0]);
    out.push({
      approvalId,
      title: textOf(cells[4]),
      start: days[0] ?? null,
      end: days.length > 1 ? days[days.length - 1] : null,
      days,
      // the organizer is the first line; contact person, phone and e-mail follow and are dropped
      organizer: textOf(/<strong>([\s\S]*?)<\/strong>/.exec(cells[11])?.[1] ?? cells[11].split(/<br\s*\/?>/)[0] ?? ""),
      tip: Number.isFinite(tip) && tip > 0 ? tip : null,
      detailRef: ref ? `${ref[1]}:${ref[2]}` : null,
    });
  }
  return out;
}

async function search(term: string): Promise<RegistryEvent[]> {
  const hit = cache.get(term);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.rows;
  const res = await fetch(URL, {
    method: "POST",
    headers: { "User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded", "Accept-Language": "lv" },
    body: new URLSearchParams({ filter_type: "all", filter_nosaukums: term }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`LĀB register ${res.status}`);
  const rows = parseRegistryRows(await res.text());
  cache.set(term, { at: Date.now(), rows });
  return rows;
}

/**
 * Look the certificate up in the register. Never throws: a register that is down gives status "error",
 * and the certificate asks for the points by hand as before.
 */
export async function lookupTip(cert: CertKeys, fetchRows: (term: string) => Promise<RegistryEvent[]> = search): Promise<TipLookup | null> {
  const terms = searchTerms(cert.title);
  if (!terms.length) return null;
  const rows: RegistryEvent[] = [];
  try {
    for (const [i, term] of terms.entries()) {
      if (i > 0 && !cache.has(term)) await sleep(300);
      rows.push(...(await fetchRows(term)));
    }
  } catch (err) {
    console.error("tip registry", err);
    if (!rows.length) return { status: "error", candidates: [], checkedAt: new Date().toISOString() };
  }
  return matchTip(cert, rows);
}
