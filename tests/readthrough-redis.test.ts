// Read-through from Blob with the Upstash backend against the fake REST API, with the env var names the Upstash
// console gives (UPSTASH_REDIS_REST_*). Checks: tests/readthrough-suite.ts
import { FAKE_URL, installFakeUpstash } from "./fake-upstash";
import { readThroughSuite } from "./readthrough-suite";

for (const k of ["KV_REST_API_URL", "KV_REST_API_TOKEN"]) delete process.env[k];
process.env.UPSTASH_REDIS_REST_URL = FAKE_URL;
process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
installFakeUpstash();
readThroughSuite("redis");
