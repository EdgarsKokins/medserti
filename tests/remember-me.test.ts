// "Remember me" sign-in: token lifetimes and renewal (lib/session-token.ts, proxy.ts). Fictional users only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { decodeJwt, SignJWT } from "jose";
import { NextRequest } from "next/server";
import { config, proxy } from "../proxy";
import { secret } from "../lib/secret";
import { isCurrentSession, PLAIN_MAX_AGE, readSession, REMEMBERED_MAX_AGE, renewedToken, SESSION_COOKIE, signSession } from "../lib/session-token";

const USER = "11111111-1111-4111-8111-111111111111";
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const START = Date.UTC(2026, 10, 1, 9);

const visit = async (pathname: string, token?: string, lang = "lv") =>
  proxy(new NextRequest(`https://medserti.lv${pathname}`, { headers: { cookie: `lang=${lang}${token ? `; ${SESSION_COOKIE}=${token}` : ""}` } }));

/** A token as sign-in made it before the claim existed: 30 days, `sv`, no `rm` */
const oldToken = (sv: number, now: number) =>
  new SignJWT({ sub: USER, sv })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(Math.floor(now / 1000))
    .setExpirationTime(Math.floor(now / 1000) + REMEMBERED_MAX_AGE)
    .sign(secret());

test("ticked: the token lasts 30 days and says it is remembered", async () => {
  const claims = decodeJwt(await signSession(USER, 3, true, START));
  assert.equal(claims.exp! - claims.iat!, 30 * 24 * 60 * 60);
  assert.equal(claims.rm, true);
  assert.equal(claims.sv, 3);
});

test("not ticked: the token lasts 8 hours and has no claim", async () => {
  const claims = decodeJwt(await signSession(USER, 3, false, START));
  assert.equal(claims.exp! - claims.iat!, 8 * 60 * 60);
  assert.equal(claims.rm, undefined);
});

test("not ticked: valid just before 8 hours, gone just after", async () => {
  const token = await signSession(USER, 0, false, START);
  assert.equal((await readSession(token, START + 8 * HOUR - 1000))?.userId, USER);
  assert.equal(await readSession(token, START + 8 * HOUR + 1000), null);
});

test("not ticked: never renews, at any age", async () => {
  const token = await signSession(USER, 0, false, START);
  for (const age of [0, 1, 7, 8, 24, 48]) assert.equal(await renewedToken(token, START + age * HOUR), null, `${age} h`);
});

test("ticked: not re-issued in its first day", async () => {
  const token = await signSession(USER, 0, true, START);
  assert.equal(await renewedToken(token, START + HOUR), null);
  assert.equal(await renewedToken(token, START + DAY - 1000), null);
});

test("ticked: after a day it is re-issued for a fresh 30 days, same user and `sv`", async () => {
  const later = START + 5 * DAY;
  const renewed = await renewedToken(await signSession(USER, 4, true, START), later);
  assert.ok(renewed);
  const claims = decodeJwt(renewed);
  assert.equal(claims.sub, USER);
  assert.equal(claims.sv, 4);
  assert.equal(claims.rm, true);
  assert.equal(claims.iat, Math.floor(later / 1000));
  assert.equal(claims.exp! - claims.iat!, REMEMBERED_MAX_AGE);
});

test("ticked: used every day for 3 months stays signed in; left unused for 30 days does not", async () => {
  let token = await signSession(USER, 0, true, START);
  for (let day = 1; day <= 90; day++) {
    const now = START + day * DAY;
    assert.ok(await readSession(token, now), `day ${day}`);
    token = (await renewedToken(token, now)) ?? token;
  }
  const last = START + 90 * DAY;
  assert.ok(await readSession(token, last + 30 * DAY - 1000));
  assert.equal(await readSession(token, last + 30 * DAY + 1000), null);
  assert.equal(await renewedToken(token, last + 30 * DAY + 1000), null, "an expired login cannot be renewed");
});

test("old `sv`: renewal keeps it, so a password reset still ends the session", async () => {
  const afterReset = { sessionVersion: 2 };
  const before = await signSession(USER, 1, true, START);
  assert.equal(isCurrentSession((await readSession(before, START))!, afterReset), false);
  const renewed = await renewedToken(before, START + 2 * DAY);
  assert.ok(renewed);
  const session = await readSession(renewed, START + 2 * DAY);
  assert.equal(session?.sv, 1);
  assert.equal(isCurrentSession(session!, afterReset), false, "a renewed token from before the reset stays rejected");
  const current = await readSession((await renewedToken(await signSession(USER, 2, true, START), START + 2 * DAY))!, START + 2 * DAY);
  assert.equal(isCurrentSession(current!, afterReset), true, "a token from after the reset renews and stays valid");
});

test("a user who never reset a password has no sessionVersion: `sv` 0 matches", async () => {
  assert.equal(isCurrentSession((await readSession(await signSession(USER, 0, true, START), START))!, {}), true);
  assert.equal(isCurrentSession((await readSession(await signSession(USER, 1, true, START), START))!, {}), false);
});

test("old token without the claim: still valid until its original date, never renewed", async () => {
  const token = await oldToken(2, START);
  const session = await readSession(token, START + 29 * DAY);
  assert.equal(session?.userId, USER);
  assert.equal(session?.sv, 2);
  assert.equal(session?.remembered, false);
  assert.equal(await renewedToken(token, START + 29 * DAY), null);
  assert.equal(await readSession(token, START + 30 * DAY + 1000), null);
});

test("a token signed with another secret is neither read nor renewed", async () => {
  const forged = await new SignJWT({ sub: USER, sv: 0, rm: true })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(Math.floor(START / 1000))
    .setExpirationTime(Math.floor(START / 1000) + REMEMBERED_MAX_AGE)
    .sign(new TextEncoder().encode("a-secret-that-is-not-the-real-one-000000"));
  assert.equal(await readSession(forged, START + DAY), null);
  assert.equal(await renewedToken(forged, START + DAY), null);
});

test("proxy: a signed-in page renews a remembered login that is due", async () => {
  const res = await visit("/dashboard", await signSession(USER, 1, true, Date.now() - 2 * DAY));
  const cookie = res.cookies.get(SESSION_COOKIE);
  assert.ok(cookie?.value);
  assert.equal(cookie.maxAge, REMEMBERED_MAX_AGE);
  assert.equal(cookie.httpOnly, true);
  assert.equal(cookie.path, "/");
  assert.equal(decodeJwt(cookie.value).sv, 1);
  assert.equal(res.headers.get("x-middleware-next"), "1");
});

test("proxy: sets no cookie for a young, unticked, old, expired or missing session", async () => {
  const now = Date.now();
  const cases = {
    "remembered, under a day old": await signSession(USER, 0, true, now - HOUR),
    "not ticked": await signSession(USER, 0, false, now - HOUR),
    "old token": await oldToken(0, now - 2 * DAY),
    "expired": await signSession(USER, 0, true, now - 31 * DAY),
    "garbage": "not-a-token",
    "no cookie": undefined,
  };
  for (const [name, token] of Object.entries(cases)) {
    const res = await visit("/courses", token);
    assert.equal(res.cookies.get(SESSION_COOKIE), undefined, name);
    assert.equal(res.headers.get("x-middleware-next"), "1", name);
  }
});

test("proxy: a signed-in page has no language address, even with English chosen", async () => {
  const res = await visit("/dashboard", undefined, "en");
  assert.equal(res.headers.get("location"), null);
  assert.equal(res.cookies.get("lang"), undefined);
});

test("proxy: public pages still follow the language rules and renew nothing", async () => {
  const token = await signSession(USER, 0, true, Date.now() - 2 * DAY);
  const res = await visit("/par-mums", token, "en");
  assert.ok(res.headers.get("location")?.endsWith("/en/par-mums"));
  assert.equal(res.cookies.get(SESSION_COOKIE), undefined);
  assert.ok((await visit("/ru/dashboard", token)).headers.get("location")?.endsWith("/dashboard"));
});

test("the matcher covers every page that requires sign-in", () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = path.join(dir, f);
      return statSync(p).isDirectory() ? walk(p) : [p];
    });
  const pages = walk(path.join(process.cwd(), "app")).filter((f) => f.endsWith("page.tsx") && /requireUser\(/.test(readFileSync(f, "utf8")));
  assert.ok(pages.length >= 5);
  for (const page of pages) {
    const route = "/" + path.relative(path.join(process.cwd(), "app"), path.dirname(page));
    assert.ok(config.matcher.includes(route), `${route} is missing from the matcher in proxy.ts`);
  }
});

test("renewal costs no storage: neither the proxy nor the token module loads the records", () => {
  for (const file of ["proxy.ts", "lib/session-token.ts"]) {
    const src = readFileSync(path.join(process.cwd(), file), "utf8");
    for (const m of src.matchAll(/from "([^"]+)"/g)) assert.doesNotMatch(m[1], /db|records|storage|auth$/, `${file} imports ${m[1]}`);
  }
});

const base = process.env.BASE_URL;
test("sign-in over HTTP", { skip: !base && "BASE_URL not set" }, async () => {
  if (!base) return;
  const host = new URL(base).hostname;
  if (!["localhost", "127.0.0.1", "[::1]"].includes(host) && !host.endsWith(".localhost")) throw new Error("HTTP checks run against a local dev server only");

  const json = { "Content-Type": "application/json" };
  const post = (route: string, body: unknown) => fetch(`${base}/api/auth/${route}`, { method: "POST", headers: json, body: JSON.stringify(body), redirect: "manual" });
  const setCookie = (res: Response) => res.headers.getSetCookie().find((x) => x.startsWith(`${SESSION_COOKIE}=`)) ?? "";
  const email = `remember-${randomBytes(4).toString("hex")}@medserti.test`;
  const password = randomBytes(12).toString("hex");

  const reg = await post("register", { email, password, fullName: "Test User", profession: "doctor", consent: "on" });
  assert.equal(reg.status, 200);
  assert.match(setCookie(reg), new RegExp(`Max-Age=${PLAIN_MAX_AGE}\\b`), "sign-up");
  const fresh = setCookie(reg).split(";")[0];
  // pages with a loading screen answer 200 and redirect inside the stream
  const signedIn = async (cookie: string) => !(await (await fetch(`${base}/profile`, { headers: { Cookie: cookie }, redirect: "manual" })).text()).includes("NEXT_REDIRECT");
  assert.equal(await signedIn(fresh), true, "the profile opens after sign-up");
  assert.equal(await signedIn("cme_session=not-a-token"), false, "a bad token lands on the login page");

  const plain = await post("login", { email, password });
  assert.match(setCookie(plain), new RegExp(`Max-Age=${PLAIN_MAX_AGE}\\b`), "not ticked");
  const ticked = await post("login", { email, password, remember: "on" });
  assert.match(setCookie(ticked), new RegExp(`Max-Age=${REMEMBERED_MAX_AGE}\\b`), "ticked");

  const demo = await fetch(`${base}/api/auth/demo`, { redirect: "manual" });
  assert.equal(demo.status, 303);
  assert.match(setCookie(demo), new RegExp(`Max-Age=${PLAIN_MAX_AGE}\\b`), "demo");
});
