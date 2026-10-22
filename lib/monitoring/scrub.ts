/*
 * Error reports without personal data, shared by the browser reporter and the server.
 * Pure functions, no imports: safe in client bundles and in tests.
 */

export const MAX_MESSAGE = 300;
const MAX_ROUTE = 120;

const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu;
// Latvian personal code: DDMMYY-NNNNN, or 32NNNN-NNNNN since 2017; with or without the hyphen
const PERSONAL_CODE = /\b\d{6}-?\d{5}\b/g;
// phone, card and account numbers
const LONG_NUMBER = /\+?\b\d[\d ]{6,}\d\b/g;
const JWT = /\beyJ[\w-]+\.[\w-]+\.[\w-]+/g;
const BEARER = /\b(Bearer|token|key|secret|password)([=:\s]+)\S+/gi;
// reset tokens, hashes and other long opaque values
const OPAQUE = /\b[A-Za-z0-9_-]{32,}\b/g;
// quoted text is where names, titles and certificate text end up in error messages ("Cannot read 'Jānis Bērziņš'")
const QUOTED = /(["'`“„«])([^"'`“”„«»\n]{2,})(["'`”“»])/g;
// query strings and fragments of URLs and paths
const QUERY = /([^\s?#"'()]*)[?#][^\s"'()]*/g;

/** Error message with emails, personal codes, numbers, tokens, quoted text and query strings removed; one line, capped */
export function scrubMessage(input: unknown): string {
  let s = typeof input === "string" ? input : input == null ? "" : String(input);
  s = s
    .replace(JWT, "[token]")
    .replace(BEARER, "$1$2[x]")
    .replace(EMAIL, "[email]")
    .replace(QUERY, "$1")
    .replace(PERSONAL_CODE, "[code]")
    .replace(LONG_NUMBER, "[n]")
    .replace(OPAQUE, "[id]")
    .replace(QUOTED, "$1…$3")
    .replace(/\s+/g, " ")
    .trim();
  return s.length > MAX_MESSAGE ? `${s.slice(0, MAX_MESSAGE - 1)}…` : s;
}

/** A path segment that identifies something (certificate id, token, number), not a page */
const isIdSegment = (seg: string) =>
  /\d/.test(seg) && seg.length >= 6 ||
  /^[0-9a-f]{8,}$/i.test(seg) ||
  /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(seg) ||
  /^\d+$/.test(seg) ||
  seg.length > 40 ||
  seg.includes("@");

/** Path only: no origin, query or fragment, ids replaced by :id. "/api/certificates/k3j9x2a/file?x=1" -> "/api/certificates/:id/file" */
export function scrubRoute(input: unknown): string {
  if (typeof input !== "string" || !input) return "/";
  let p = input.trim();
  try {
    if (/^[a-z]+:\/\//i.test(p)) p = new URL(p).pathname;
  } catch {
    p = "/";
  }
  p = p.split(/[?#]/)[0] || "/";
  // App Router route patterns ("/api/certificates/[id]") are already free of ids
  const out = p
    .split("/")
    .map((seg) => {
      if (!seg || /^\[.+\]$/.test(seg)) return seg;
      let s = seg;
      try {
        s = decodeURIComponent(seg);
      } catch {}
      return isIdSegment(s) ? ":id" : seg;
    })
    .join("/");
  return (out.startsWith("/") ? out : `/${out}`).slice(0, MAX_ROUTE);
}

/**
 * The first stack frame from our own code, reduced to function and file:line, no origin or query string.
 * "at deleteRow (https://medserti.lv/_next/static/chunks/app/certificates/page-1a2b.js?dpl=x:1:2345)"
 *   -> "deleteRow chunks/app/certificates/page-1a2b.js:1"
 */
export function topFrame(stack: unknown): string {
  if (typeof stack !== "string") return "";
  const frames = stack
    .split("\n")
    .map((l) => l.trim())
    .map((l) => {
      // V8: "at fn (file:line:col)" or "at file:line:col"; Safari/Firefox: "fn@file:line:col"
      const m = l.match(/^at (?:(.+?) \()?(.+?):(\d+):\d+\)?$/) ?? l.match(/^(?:(.*?)@)?(.+?):(\d+):\d+$/);
      if (!m) return null;
      const fn = (m[1] ?? "").replace(/^async /, "").slice(0, 60);
      const file = m[2].split(/[?#]/)[0].replace(/^.*?(\/_next\/static\/|\/\.next\/server\/|webpack-internal:\/\/\/(\(\w+\)\/)?\.?\/?)/, "");
      return { fn, file: file.split("/").slice(-3).join("/"), line: m[3], lib: /node_modules|node:internal|^node:|<anonymous>|next\/dist/.test(m[2]) };
    })
    .filter((f): f is NonNullable<typeof f> => !!f);
  const f = frames.find((x) => !x.lib) ?? frames[0];
  return f ? `${f.fn ? `${f.fn} ` : ""}${f.file}:${f.line}`.slice(0, 160) : "";
}

/** 64-bit FNV-1a as hex; the same in the browser and on the server, without crypto */
export function hash(s: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

/**
 * Same error, same fingerprint: message with numbers and placeholders evened out, route, top frame.
 * Line numbers stay: a new deployment moving the frame is a different place in the code.
 */
export function fingerprint(message: string, route: string, frame: string): string {
  const msg = message.replace(/\d+/g, "0").replace(/\[(email|code|n|id|token)\]/g, "_").toLowerCase();
  return hash(`${msg}|${route}|${frame}`).slice(0, 12);
}

/** first match wins: Edge, Opera and Samsung also say Chrome, and Chrome also says Safari */
const BROWSERS: [RegExp, string][] = [
  [/Edg(?:A|iOS)?\/(\d+)/, "Edge"],
  [/OPR\/(\d+)/, "Opera"],
  [/SamsungBrowser\/(\d+)/, "Samsung"],
  [/YaBrowser\/(\d+)/, "Yandex"],
  [/(?:Firefox|FxiOS)\/(\d+)/, "Firefox"],
  [/(?:Chrome|CriOS)\/(\d+)/, "Chrome"],
  [/Version\/(\d+).*Safari\//, "Safari"],
];

/** Browser family, major version, OS and mobile or not, from a user-agent string: "Chrome 141 · Android · mobile" */
export function deviceLabel(ua: unknown): string {
  if (typeof ua !== "string" || !ua) return "";
  let name = "";
  for (const [re, label] of BROWSERS) {
    const m = ua.match(re);
    if (m) {
      name = `${label} ${m[1]}`;
      break;
    }
  }
  const os = /iPhone|iPad|iPod/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X|Macintosh/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  const mobile = /Mobi|iPhone|Android/.test(ua) ? "mobile" : "";
  return [name || "other", os, mobile].filter(Boolean).join(" · ").slice(0, 60);
}
