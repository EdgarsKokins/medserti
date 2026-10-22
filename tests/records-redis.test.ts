// Record store with the Upstash backend, talking REST to a fake Upstash (tests/fake-upstash.ts) that runs the Lua
// scripts in a real Lua interpreter. Same checks as the local fallback: tests/records-suite.ts
import { FAKE_URL, installFakeUpstash } from "./fake-upstash";
import { recordsSuite } from "./records-suite";

// the names the Vercel Marketplace integration injects
process.env.KV_REST_API_URL = FAKE_URL;
process.env.KV_REST_API_TOKEN = "test-token";
installFakeUpstash();
recordsSuite("redis");
