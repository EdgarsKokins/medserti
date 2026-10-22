// Record store with the local file fallback (no Redis env vars), as in `npm run dev`. Checks: tests/records-suite.ts
import { recordsSuite } from "./records-suite";

for (const k of ["KV_REST_API_URL", "KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]) delete process.env[k];
recordsSuite("local");
