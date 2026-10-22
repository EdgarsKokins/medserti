/**
 * Tests for the /admin text overrides.
 *
 *   npx tsx --tsconfig tsconfig.json "Working for Claude/admin-test/test.ts"              # merge + validation only
 *   BASE_URL=http://localhost:3300 npx tsx --tsconfig tsconfig.json "Working for Claude/admin-test/test.ts"
 *
 * With BASE_URL it also checks the access rules against a running local dev server (localhost only: it creates a test
 * account in the local ./.data store). It signs in to /admin with ADMIN_PASSWORD, or the default "1234".
 */
import { randomBytes } from "crypto";
import { baseDict, t } from "@/lib/i18n";
import { courseStrings } from "@/components/courses/strings";
import { catalog, compileOverrides, validateOverrides } from "@/lib/i18n/catalog";
import { fillTemplate, setI18nOverrides } from "@/lib/i18n/overrides";

let failed = 0;
let passed = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++;
  else {
    failed++;
    console.log(`FAIL  ${name}`, detail === undefined ? "" : JSON.stringify(detail));
  }
}
const eq = (name: string, got: unknown, want: unknown) => check(name, JSON.stringify(got) === JSON.stringify(want), { got, want });

/* ---------- catalog ---------- */
const { byKey } = catalog();
eq("plain string is text", byKey.get("dashboard.chartTitle")?.lv.kind, "text");
eq("pure function is a template", byKey.get("courses.needLine")?.lv.kind, "template");
eq("template default uses named placeholders", byKey.get("courses.needLine")?.lv.def, "Jums vēl jāsavāc {n} TIP.");
eq("plural helper is code", byKey.get("dashboard.daysLeftShort")?.lv.kind, "code");
eq("plural helper is code (courses)", byKey.get("courses.results")?.en.kind, "code");
eq("if/else function is code", byKey.get("dashboard.statusRemaining")?.lv.kind, "code");
eq("object-argument template fields", byKey.get("parseNotes.multiplePoints")?.en.params, ["list"]);
eq("locale codes are hidden", byKey.has("landing.ogLocale"), false);
eq("array items are separate texts", byKey.has("landingA.steps.0.title") && byKey.has("about.story.1"), true);

/* ---------- validation ---------- */
const bad = (name: string, input: unknown) => check(name, !validateOverrides(input).ok, validateOverrides(input));
bad("unknown placeholder rejected", { lv: { "courses.needLine": "Vēl {x} TIP" } });
bad("missing placeholder rejected", { lv: { "courses.needLine": "Vēl daži TIP" } });
bad("placeholder in a plain chart string must stay", { en: { "chart.targetReached": "Target reached." } });
bad("code-only text rejected", { lv: { "dashboard.daysLeftShort": "{n} dienas" } });
bad("unknown key rejected", { lv: { "nope.nothing": "x" } });
bad("non-string rejected", { lv: { "dashboard.chartTitle": 5 } });
bad("empty rejected", { lv: { "dashboard.chartTitle": "   " } });
bad("too long rejected", { lv: { "dashboard.chartTitle": "a".repeat(5000) } });
bad("unknown language rejected", { de: {} });
bad("not an object rejected", ["lv"]);
const okRes = validateOverrides({ lv: { "dashboard.chartTitle": baseDict("lv").dashboard.chartTitle, "nav.courses": "Mācības" } });
eq("value equal to the default is dropped", okRes.ok && okRes.value, { lv: { "nav.courses": "Mācības" }, en: {} });

/* ---------- merge ---------- */
eq("no overrides: t() returns the code dictionary itself", t("lv") === baseDict("lv"), true);
const stored = {
  lv: {
    "dashboard.chartTitle": "TIP pa mēnešiem",
    "landingA.steps.1.title": "Punkti krājas paši",
    "about.people.0.role": "Līdzdibinātājs",
    "courses.needLine": "Jāsavāc vēl {n} TIP.",
    "courses.details.more": "un vēl {n}",
    "certs.summary": "TIP: {points}, faili: {count}.",
    "parseNotes.noTitle": "Nav nosaukuma.",
    "dashboard.daysLeftShort": "ignored {n}",
    "gone.key": "ignored",
  },
  en: { "parseNotes.multiplePoints": "Several values ({list}); we took the first." },
};
const runtime = compileOverrides(stored);
eq("compile: positional placeholders", runtime.lv?.["certs.summary"], "TIP: {1}, faili: {0}.");
eq("compile: object placeholders", runtime.en?.["parseNotes.multiplePoints"], "Several values ({0.list}); we took the first.");
eq("compile: code-only and unknown keys skipped", ["dashboard.daysLeftShort", "gone.key"].map((k) => k in (runtime.lv ?? {})), [false, false]);
setI18nOverrides(runtime);
const lv = t("lv");
eq("plain string", lv.dashboard.chartTitle, "TIP pa mēnešiem");
eq("nested array item", lv.landingA.steps[1].title, "Punkti krājas paši");
eq("sibling array item untouched", lv.landingA.steps[0].title, baseDict("lv").landingA.steps[0].title);
eq("array field next to an edited one untouched", lv.landingA.steps[1].body, baseDict("lv").landingA.steps[1].body);
eq("array of objects", lv.about.people[0].role, "Līdzdibinātājs");
eq("still an array", Array.isArray(lv.landingA.steps) && lv.landingA.steps.length, baseDict("lv").landingA.steps.length);
eq("template, reordered placeholders", lv.certs.summary(3, "40"), "TIP: 40, faili: 3.");
eq("zero-argument function", lv.parseNotes.noTitle(), "Nav nosaukuma.");
eq("code-only function keeps code", lv.dashboard.daysLeftShort(1), baseDict("lv").dashboard.daysLeftShort(1));
eq("courses template", courseStrings("lv").needLine("12,5"), "Jāsavāc vēl 12,5 TIP.");
eq("courses nested template", courseStrings("lv").details.more(3), "un vēl 3");
eq("object-argument template", t("en").parseNotes.multiplePoints({ list: "12; 16" }), "Several values (12; 16); we took the first.");
eq("other language untouched", t("en").dashboard.chartTitle, baseDict("en").dashboard.chartTitle);
eq("code dictionary not mutated", baseDict("lv").dashboard.chartTitle !== "TIP pa mēnešiem", true);
eq("memoized", t("lv") === lv, true);
eq("untouched subtree shares the code object", lv.api === baseDict("lv").api, true);
eq("fill: missing argument is empty", fillTemplate("a{0}b{1}c", ["x"]), "axbc");
setI18nOverrides({});
eq("cleared overrides restore the code text", t("lv").dashboard.chartTitle, baseDict("lv").dashboard.chartTitle);

/* ---------- access over HTTP ---------- */
async function http() {
  const base = process.env.BASE_URL;
  if (!base) return console.log("(BASE_URL not set: skipping the HTTP checks)");
  const host = new URL(base).hostname;
  if (!["localhost", "127.0.0.1", "[::1]"].includes(host)) throw new Error("HTTP checks run against a local dev server only");

  const api = `${base}/api/admin/translations`;
  const anon = async (method: string) => (await fetch(api, { method, headers: { "Content-Type": "application/json" }, body: method === "GET" ? undefined : "{}" })).status;
  for (const m of ["GET", "PUT", "POST", "DELETE"]) eq(`signed out: ${m} API is 404`, await anon(m), 404);
  const loginPage = await fetch(`${base}/admin`);
  const loginHtml = await loginPage.text();
  check("signed out: /admin shows the password form, not the editor", loginHtml.includes("admin-password") && !loginHtml.includes("Rezerves kopija"));

  // a normal signed-in user is not an admin
  const email = `user-${randomBytes(4).toString("hex")}@medserti.test`;
  const reg = await fetch(`${base}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: randomBytes(12).toString("hex"), fullName: "Test User" }),
  });
  const user = reg.headers.getSetCookie().find((x) => x.startsWith("cme_session="))?.split(";")[0];
  check("non-admin test account signed in", !!user);
  if (user) {
    const h = { Cookie: user, "Content-Type": "application/json" };
    eq("app user without admin password: GET API is 404", (await fetch(api, { headers: h })).status, 404);
    eq("app user without admin password: PUT API is 404", (await fetch(api, { method: "PUT", headers: h, body: JSON.stringify({ lv: {} }) })).status, 404);
  }

  const login = (password: unknown) =>
    fetch(`${base}/api/admin/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
  eq("wrong password is 401", (await login("0000")).status, 401);
  eq("missing password is 401", (await login(undefined)).status, 401);
  const forged = { Cookie: "medserti_admin=eyJhbGciOiJIUzI1NiJ9.eyJhZG0iOiJ4In0.x", "Content-Type": "application/json" };
  eq("forged admin cookie: GET API is 404", (await fetch(api, { headers: forged })).status, 404);

  // the project's default admin password, unless the server was started with another ADMIN_PASSWORD
  const ok = await login(process.env.ADMIN_PASSWORD || "1234");
  eq("right password is 200", ok.status, 200);
  const cookie = ok.headers.getSetCookie().find((x) => x.startsWith("medserti_admin="))?.split(";")[0];
  check("admin cookie set", !!cookie);
  if (!cookie) return;
  const h = { Cookie: cookie, "Content-Type": "application/json" };
  const get = await fetch(api, { headers: h });
  eq("admin: GET API is 200", get.status, 200);
  const before = (await get.json()).overrides;
  check("admin: /admin shows the editor", (await (await fetch(`${base}/admin`, { headers: { Cookie: cookie } })).text()).includes("Rezerves kopija"));
  eq("admin: invalid save is 422", (await fetch(api, { method: "PUT", headers: h, body: JSON.stringify({ lv: { "courses.needLine": "{x}" } }) })).status, 422);
  eq("admin: form-encoded save is refused", (await fetch(api, { method: "PUT", headers: { Cookie: cookie, "Content-Type": "text/plain" }, body: "{}" })).status, 415);
  const marker = `Kursi-${randomBytes(3).toString("hex")}`;
  const put = await fetch(api, { method: "PUT", headers: h, body: JSON.stringify({ lv: { ...before.lv, "nav.courses": marker }, en: before.en }) });
  eq("admin: valid save is 200", put.status, 200);
  if (user) {
    const page = await (await fetch(`${base}/dashboard`, { headers: { Cookie: `${user}; lang=lv` } })).text();
    check("saved text shows up in the server-rendered nav", page.includes(marker));
  }
  const restore = await fetch(api, { method: "POST", headers: h, body: JSON.stringify({ action: "restore" }) });
  eq("admin: restore is 200", restore.status, 200);
  eq("admin: restore brings back the previous version", (await restore.json()).overrides, before);
  const out = await fetch(`${base}/api/admin/logout`, { method: "POST", headers: { Cookie: cookie } });
  check("logout clears the admin cookie", !!out.headers.getSetCookie().find((x) => x.startsWith("medserti_admin=;") || /medserti_admin=.*(Max-Age=0|Expires=Thu, 01 Jan 1970)/.test(x)));
}

http()
  .catch((e) => {
    failed++;
    console.log("FAIL  HTTP checks:", e instanceof Error ? e.message : e);
  })
  .finally(() => {
    console.log(`${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
  });
