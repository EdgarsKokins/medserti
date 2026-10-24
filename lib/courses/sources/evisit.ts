import type { Course } from "../types";
import { fetchText, textOf, tipIn } from "../util";

/**
 * Evisit (evisit.eu) is an e-learning portal: recorded lectures, watched after a free sign-up. Its public
 * "Aktualitātes" page lists the current ones as cards: title, type, "Mērķauditorija: ...", price and TIP.
 * There is no date on the card, so every card is an always-available recording. The full catalogue is behind
 * the login and is not read.
 */
const LIST = "https://www.evisit.eu/current-events/index";
const BASE = "https://www.evisit.eu";
/** courses for doctors, nurses or all practitioners; pharmacist-only lectures are left out */
const FOR_US = /ārst|mās|ārstniecības\s+person/iu;

/** "Bezmaksas" / "10,00 EUR" / "Maksas" -> our price fields */
function priceOf(line: string): Pick<Course, "price" | "free"> | null {
  if (/^bezmaksas$/iu.test(line)) return { price: "Bez maksas", free: true };
  const eur = /^(\d+(?:[.,]\d{1,2})?)\s*(?:EUR|€)$/iu.exec(line);
  if (eur) {
    const n = Number(eur[1].replace(",", "."));
    return n === 0 ? { price: "Bez maksas", free: true } : { price: `EUR ${n.toFixed(2).replace(".", ",")}`, free: false };
  }
  // paid, amount shown only after login
  if (/^maksas$/iu.test(line)) return { price: "Par maksu", free: false };
  return null;
}

export function parseEvisit(html: string): Course[] {
  const out: Course[] = [];
  for (const card of html.split(/<div class="flex list-item\b/).slice(1)) {
    const head = /<h3>\s*<a href="([^"]+)">([\s\S]*?)<\/a>/.exec(card);
    if (!head) continue;
    const path = head[1];
    const id = /\/(\d+)\/?$/.exec(path)?.[1];
    const title = textOf(head[2]);
    if (!id || !title) continue;
    // first <p>: type, audience, price on separate lines; second <p>: "2.00 TIP"
    const info = /<div class="size-small">\s*<p>([\s\S]*?)<\/p>\s*<p>([\s\S]*?)<\/p>/.exec(card);
    if (!info) continue;
    const lines = textOf(info[1], true).split("\n");
    const audience = lines.find((l) => /^Mērķauditorija:/iu.test(l))?.replace(/^Mērķauditorija:\s*/iu, "").trim() ?? "";
    if (audience && !FOR_US.test(audience)) continue;
    const price = lines.map(priceOf).find(Boolean) ?? { price: null, free: false };
    out.push({
      id: `evisit:${id}`,
      kind: "recorded",
      source: "evisit",
      title,
      url: new URL(path, BASE).toString(),
      startDate: null,
      endDate: null,
      availableUntil: null,
      format: "recorded",
      location: "evisit.eu",
      city: "Online",
      tip: tipIn(textOf(info[2])),
      minutes: null,
      audience,
      // "Ārsti, māsas ..." without a specialty named: open to doctors of every specialty
      allSpecialties: /^ārst|ārstniecības\s+person/iu.test(audience),
      // as LĀB writes it on its TIP list
      organizer: 'SIA "Evisit.lv"',
      approvalId: null,
      annexItem: null,
      ...price,
    });
  }
  return out;
}

export async function fetchEvisit(): Promise<Course[]> {
  return parseEvisit(await fetchText(LIST));
}
