import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { languageAddress } from "../proxy";

const visit = (path: string, headers: Record<string, string>, cookie = "lang=lv") =>
  languageAddress(new NextRequest(`https://medserti.lv${path}`, { headers: { cookie, ...headers } }));
const PAGE_LOAD = { "sec-fetch-dest": "document", accept: "text/html,application/xhtml+xml" };
const LINK_FETCH = { "sec-fetch-dest": "empty", accept: "*/*" };

test("opening an English address remembers English", () => {
  assert.equal(visit("/en/par-mums", PAGE_LOAD).cookies.get("lang")?.value, "en");
});

test("a link fetched ahead of a click does not change the language", () => {
  const res = visit("/en/par-mums", LINK_FETCH);
  assert.equal(res.cookies.get("lang"), undefined);
  assert.ok(res.headers.get("x-middleware-rewrite")?.endsWith("/par-mums"), "still shows the English page");
});

test("a browser without Sec-Fetch headers is told apart by Accept", () => {
  assert.equal(visit("/en/par-mums", { accept: "text/html" }).cookies.get("lang")?.value, "en");
  assert.equal(visit("/en/par-mums", { accept: "*/*" }).cookies.get("lang"), undefined);
});

test("a first visit remembers Latvian", () => {
  assert.equal(visit("/par-mums", PAGE_LOAD, "").cookies.get("lang")?.value, "lv");
});
