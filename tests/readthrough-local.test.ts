// Read-through from Blob with the local file store. Checks: tests/readthrough-suite.ts
import { readThroughSuite } from "./readthrough-suite";

for (const k of ["KV_REST_API_URL", "KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]) delete process.env[k];
readThroughSuite("local");
