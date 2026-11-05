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
/** An upload waits for a number this long at most, then goes on with what the parser read */
const NUMBER_TIMEOUT_MS = 2_500;

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
      audience: textOf(cells[5]),
      tip: Number.isFinite(tip) && tip > 0 ? tip : null,
      detailRef: ref ? `${ref[1]}:${ref[2]}` : null,
    });
  }
  return out;
}

async function ask(form: Record<string, string>, key: string, timeout = TIMEOUT_MS): Promise<RegistryEvent[]> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.rows;
  const res = await fetch(URL, {
    method: "POST",
    headers: { "User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded", "Accept-Language": "lv" },
    body: new URLSearchParams({ filter_type: "all", ...form }),
    signal: AbortSignal.timeout(timeout),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`LĀB register ${res.status}`);
  const rows = parseRegistryRows(await res.text());
  cache.set(key, { at: Date.now(), rows });
  return rows;
}

const search = (term: string) => ask({ filter_nosaukums: term }, term);

/** One approval number; only the public number leaves the server, and only in its exact shape */
const byNumber = (id: string) => ask({ filter_number: id }, `number:${id}`, NUMBER_TIMEOUT_MS);

/** Most numbers asked per upload: a certificate has one to three, seven is a page of something else */
const MAX_NUMBERS = 7;
/** An upload waits for this at most: a slow register costs a read, not the upload */
const TOTAL_WAIT_MS = 6_000;
/** A pause between numbers, and after a failure the register is left alone this long so a batch of uploads does not wait on each file */
const PAUSE_MS = 300;
const RETRY_AFTER_MS = 5 * 60_000;
let downUntil = 0;

/**
 * Each approval number's rows, one question at a time. Never throws: a register that is down or slow gives null when nothing
 * was answered, and then the certificate keeps what the parser read.
 */
export async function lookupNumbers(ids: string[], fetchRows: (id: string) => Promise<RegistryEvent[]> = byNumber): Promise<Map<string, RegistryEvent[]> | null> {
  const wanted = [...new Set(ids)].filter((id) => /^TIP\d{4}\/\d{2,5}$/.test(id)).slice(0, MAX_NUMBERS);
  if (!wanted.length || Date.now() < downUntil) return null;
  const out = new Map<string, RegistryEvent[]>();
  const started = Date.now();
  for (const [i, id] of wanted.entries()) {
    if (Date.now() - started > TOTAL_WAIT_MS) break;
    if (i > 0 && !cache.has(`number:${id}`)) await sleep(PAUSE_MS);
    try {
      out.set(id, await fetchRows(id));
    } catch (err) {
      console.error("tip registry number", err);
      downUntil = Date.now() + RETRY_AFTER_MS;
      break;
    }
  }
  return out.size ? out : null;
}

/** After a failure the register is tried again later; tests start clean */
export function resetRegisterState() {
  downUntil = 0;
}

/**
 * Look the certificate up in the register (also for its audience, when the certificate names no specialty). Never throws: a register that is down gives status "error",
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
