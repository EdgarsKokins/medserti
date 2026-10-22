// A stand-in for the Upstash REST API: requests to FAKE_URL run on ioredis-mock, which executes EVAL scripts in a real
// Lua interpreter (fengari). Lets the tests run lib/records.ts's Upstash backend, Lua scripts included, offline.
import RedisMock from "ioredis-mock";

export const FAKE_URL = "https://fake-upstash.test";

const enc = (v: unknown): unknown =>
  typeof v === "string" ? (v === "OK" ? v : Buffer.from(v).toString("base64")) : Array.isArray(v) ? v.map(enc) : v;

/** Redis commands seen, for counting what an operation costs */
export const seen: string[] = [];

export function installFakeUpstash() {
  const redis = new RedisMock() as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>;
  const run = async (cmd: unknown[]) => {
    const [name, ...args] = cmd.map(String);
    // Redis reads SET options in any case; ioredis-mock only in upper case ("ex" from the Upstash client)
    if (name.toUpperCase() === "SET") for (let i = 2; i < args.length; i++) if (/^(ex|px|nx|xx)$/i.test(args[i])) args[i] = args[i].toUpperCase();
    seen.push(name.toUpperCase());
    let result = await redis[name.toLowerCase()](...args);
    // the REST API answers HGETALL with a flat [field, value, ...] array, like RESP
    if (name.toUpperCase() === "HGETALL") result = Object.entries(result as Record<string, string>).flat();
    return result;
  };
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.startsWith(FAKE_URL)) return realFetch(input, init);
    const body = JSON.parse(String(init?.body));
    const base64 = new Headers(init?.headers).get("upstash-encoding") === "base64";
    const answer = async (cmd: unknown[]) => {
      try {
        const result = await run(cmd);
        return { result: base64 ? enc(result) : result };
      } catch (e) {
        return { error: (e as Error).message };
      }
    };
    const out = url.includes("/pipeline") || url.includes("/multi-exec") ? await Promise.all((body as unknown[][]).map(answer)) : await answer(body);
    return new Response(JSON.stringify(out), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}
