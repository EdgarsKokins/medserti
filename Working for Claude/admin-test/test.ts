/**
 * Tests for the /admin text overrides.
 *
 *   npx tsx --tsconfig tsconfig.json "Working for Claude/admin-test/test.ts"              # merge + validation only
 *   BASE_URL=http://localhost:3300 npx tsx --tsconfig tsconfig.json "Working for Claude/admin-test/test.ts"
 *
 * With BASE_URL it also checks the access rules against a running local dev server (localhost only: it creates accounts
 * in the local ./.data store). For the admin part, start the server with ADMIN_EMAILS=admin-test@medserti.test.
 * The test admin's random password is kept in ./.data/admin-test.json (gitignored), never printed.
 */
import { randomBytes } from "crypto";
import { promises as fs } from "fs";
import path from "path";
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
    "profile.overrideNote": "Noteikumi: {rule} TIP, jūs: {mine} TIP.",
    "parseNotes.noTitle": "Nav nosaukuma.",
    "dashboard.daysLeftShort": "ignored {n}",
    "gone.key": "ignored",
  },
  en: { "parseNotes.multiplePoints": "Several values ({list}); we took the first." },
};
const runtime = compileOverrides(stored);
eq("compile: positional placeholders", runtime.lv?.["profile.overrideNote"], "Noteikumi: {1} TIP, jūs: {0} TIP.");
eq("compile: object placeholders", runtime.en?.["parseNotes.multiplePoints"], "Several values ({0.list}); we took the first.");
eq("compile: code-only and unknown keys skipped", ["dashboard.daysLeftShort", "gone.key"].map((k) => k in (runtime.lv ?? {})), [false, false]);
setI18nOverrides(runtime);
const lv = t("lv");
eq("plain string", lv.dashboard.chartTitle, "TIP pa mēnešiem");
eq("nested array item", lv.landingA.steps[1].title, "Punkti krājas paši");
eq("sibling array item untouched", lv.landingA.steps[0].title, baseDict("lv").landingA.steps[0].title);
eq("array field next to an edited one untouched", lv.landingA.steps[1].body, baseDict("lv").landingA.steps[1].body);
eq("array of objects", lv.about.people[0].role, "Līdzdibinātājs");
eq("still an array", Array.isArray(lv.landingA.steps) && lv.landingA.steps.length, 3);
eq("template, reordered placeholders", lv.profile.overrideNote(200, 250), "Noteikumi: 250 TIP, jūs: 200 TIP.");
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
  eq("signed out: /admin page is 404", (await fetch(`${base}/admin`)).status, 404);

  async function session(email: string, password: string): Promise<string | null> {
    for (const [p, body] of [
      ["/api/auth/register", { email, password, fullName: "Admin Test" }],
      ["/api/auth/login", { email, password }],
    ] as const) {
      const r = await fetch(base + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const c = r.headers.getSetCookie().find((x) => x.startsWith("cme_session="));
      if (r.ok && c) return c.split(";")[0];
    }
    return null;
  }

  const user = await session(`user-${randomBytes(4).toString("hex")}@medserti.test`, randomBytes(12).toString("hex"));
  check("non-admin test account signed in", !!user);
  if (user) {
    const h = { Cookie: user, "Content-Type": "application/json" };
    eq("non-admin: GET API is 404", (await fetch(api, { headers: h })).status, 404);
    eq("non-admin: PUT API is 404", (await fetch(api, { method: "PUT", headers: h, body: JSON.stringify({ lv: { "nav.courses": "x" } }) })).status, 404);
    eq("non-admin: POST restore is 404", (await fetch(api, { method: "POST", headers: h, body: JSON.stringify({ action: "restore" }) })).status, 404);
    eq("non-admin: /admin page is 404", (await fetch(`${base}/admin`, { headers: { Cookie: user } })).status, 404);
  }

  // admin: only when the dev server lists the test admin in ADMIN_EMAILS
  const credFile = path.join(process.cwd(), ".data", "admin-test.json");
  let cred: { email: string; password: string };
  try {
    cred = JSON.parse(await fs.readFile(credFile, "utf8"));
  } catch {
    cred = { email: "admin-test@medserti.test", password: randomBytes(12).toString("hex") };
    await fs.mkdir(path.dirname(credFile), { recursive: true });
    await fs.writeFile(credFile, JSON.stringify(cred));
  }
  const admin = await session(cred.email, cred.password);
  if (!admin) return console.log("(test admin could not sign in: skipping the admin checks)");
  const h = { Cookie: admin, "Content-Type": "application/json" };
  const get = await fetch(api, { headers: h });
  if (get.status === 404) return console.log(`(${cred.email} is not in the server's ADMIN_EMAILS: skipping the admin checks)`);
  eq("admin: GET API is 200", get.status, 200);
  const before = (await get.json()).overrides;
  eq("admin: /admin page is 200", (await fetch(`${base}/admin`, { headers: { Cookie: admin } })).status, 200);
  eq("admin: invalid save is 422", (await fetch(api, { method: "PUT", headers: h, body: JSON.stringify({ lv: { "courses.needLine": "{x}" } }) })).status, 422);
  eq("admin: form-encoded save is refused", (await fetch(api, { method: "PUT", headers: { Cookie: admin, "Content-Type": "text/plain" }, body: "{}" })).status, 415);
  const marker = `Kursi-${randomBytes(3).toString("hex")}`;
  const put = await fetch(api, { method: "PUT", headers: h, body: JSON.stringify({ lv: { ...before.lv, "nav.courses": marker }, en: before.en }) });
  eq("admin: valid save is 200", put.status, 200);
  const page = await (await fetch(`${base}/dashboard`, { headers: { Cookie: `${admin}; lang=lv` } })).text();
  check("saved text shows up in the server-rendered nav", page.includes(marker));
  const restore = await fetch(api, { method: "POST", headers: h, body: JSON.stringify({ action: "restore" }) });
  eq("admin: restore is 200", restore.status, 200);
  eq("admin: restore brings back the previous version", (await restore.json()).overrides, before);
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
