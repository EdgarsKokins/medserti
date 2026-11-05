import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { proxy } from "../proxy";

const visit = (path: string, headers: Record<string, string> = {}) =>
  proxy(new NextRequest(`https://medserti.lv${path}`, { headers: { cookie: "lang=lv", ...headers } }));

test("opening an English address remembers English", () => {
  assert.equal(visit("/en/par-mums").cookies.get("lang")?.value, "en");
});

test("a link fetched ahead of a click does not change the language", () => {
  const prefetches: Record<string, string>[] = [{ "next-router-prefetch": "1", rsc: "1" }, { purpose: "prefetch" }, { "sec-purpose": "prefetch" }];
  for (const headers of prefetches) {
    const res = visit("/en/par-mums", headers);
    assert.equal(res.cookies.get("lang"), undefined);
    assert.ok(res.headers.get("x-middleware-rewrite")?.endsWith("/par-mums"), "still shows the English page");
  }
});

test("a first visit remembers Latvian", () => {
  const res = proxy(new NextRequest("https://medserti.lv/par-mums"));
  assert.equal(res.cookies.get("lang")?.value, "lv");
});
