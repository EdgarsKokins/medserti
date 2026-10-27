// clientIp must not trust the client-controlled leftmost x-forwarded-for entry (security audit, October 2026).
// A rotating XFF header must never give an attacker a fresh rate-limit bucket.
import { test } from "node:test";
import assert from "node:assert/strict";
import { clientIp } from "../lib/password-reset";

const ip = (headers: Record<string, string>) => clientIp(new Request("https://medserti.lv", { headers }));

test("x-real-ip (Vercel's trusted header) wins, whatever x-forwarded-for says", () => {
  assert.equal(ip({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "1.2.3.4" }), "203.0.113.7");
  // the attack: rotating the spoofable leftmost XFF entry must not change the bucket
  assert.equal(ip({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "9.9.9.9" }), "203.0.113.7");
});

test("without x-real-ip, the rightmost XFF entry is used, not the client-controlled leftmost", () => {
  // "<spoofed by client>, <added by the trusted edge>"
  assert.equal(ip({ "x-forwarded-for": "6.6.6.6, 203.0.113.7" }), "203.0.113.7");
  assert.equal(ip({ "x-forwarded-for": "evil, 203.0.113.7" }), "203.0.113.7");
});

test("a non-IP value collapses to one fixed bucket", () => {
  assert.equal(ip({ "x-real-ip": "not-an-ip" }), "unknown");
  assert.equal(ip({ "x-forwarded-for": "garbage" }), "unknown");
  assert.equal(ip({}), "unknown");
});

test("IPv6 is accepted", () => {
  assert.equal(ip({ "x-real-ip": "2001:db8::1" }), "2001:db8::1");
});
