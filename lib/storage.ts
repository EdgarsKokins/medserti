import "server-only";
import { put, get, del, list } from "@vercel/blob";
import { promises as fs } from "fs";
import path from "path";

/**
 * Minimal key-value + file storage.
 * Production: private Vercel Blob store (BLOB_READ_WRITE_TOKEN).
 * Local without a token: files under ./.data.
 */
const useBlob = !!process.env.BLOB_READ_WRITE_TOKEN;
const LOCAL_ROOT = path.join(process.cwd(), ".data");

function localPath(pathname: string) {
  const p = path.join(LOCAL_ROOT, pathname);
  if (!p.startsWith(LOCAL_ROOT)) throw new Error("Invalid path");
  return p;
}

/**
 * STORAGE_TRACE=1 logs every store operation, to measure what a page costs against the Blob quota:
 * get = simple operation; put and list = advanced operation; del = free
 */
const trace = (op: "get" | "put" | "list" | "del", path: string) => {
  if (process.env.STORAGE_TRACE) console.log(`[storage] ${op} ${path}`);
};

async function streamToBuffer(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  return Buffer.from(await new Response(stream).arrayBuffer());
}

export async function putBytes(pathname: string, data: Buffer, contentType: string): Promise<void> {
  trace("put", pathname);
  if (useBlob) {
    await put(pathname, data, { access: "private", contentType, addRandomSuffix: false, allowOverwrite: true });
    return;
  }
  const p = localPath(pathname);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, data);
}

export async function getBytes(pathname: string): Promise<{ data: Buffer; contentType: string } | null> {
  trace("get", pathname);
  if (useBlob) {
    const res = await get(pathname, { access: "private", useCache: false });
    if (!res || res.statusCode !== 200) return null;
    return { data: await streamToBuffer(res.stream), contentType: res.blob.contentType };
  }
  try {
    return { data: await fs.readFile(localPath(pathname)), contentType: guessType(pathname) };
  } catch {
    return null;
  }
}

export async function putJson(pathname: string, value: unknown): Promise<void> {
  await putBytes(pathname, Buffer.from(JSON.stringify(value)), "application/json");
}

export async function getJson<T>(pathname: string): Promise<T | null> {
  const r = await getBytes(pathname);
  return r ? (JSON.parse(r.data.toString("utf8")) as T) : null;
}

export async function remove(pathname: string): Promise<void> {
  if (useBlob) {
    // page through: a prefix (a whole user folder) can hold more than one page of blobs
    let cursor: string | undefined;
    do {
      trace("list", pathname);
      const page = await list({ prefix: pathname, cursor, limit: 1000 });
      const urls = page.blobs.map((b) => b.url);
      if (urls.length) trace("del", `${pathname} (${urls.length})`);
      if (urls.length) await del(urls);
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return;
  }
  // local mode mirrors what the Blob branch costs: one list, then a delete
  trace("list", pathname);
  trace("del", pathname);
  await fs.rm(localPath(pathname), { recursive: true, force: true });
}

/** List pathnames under a prefix */
export async function listPaths(prefix: string): Promise<string[]> {
  return (await listVersions(prefix)).map((e) => e.path);
}

/** Pathnames under a prefix with a version tag that changes whenever the file is rewritten */
export async function listVersions(prefix: string): Promise<{ path: string; version: string }[]> {
  trace("list", prefix);
  if (useBlob) {
    const out: { path: string; version: string }[] = [];
    let cursor: string | undefined;
    do {
      const page = await list({ prefix, cursor, limit: 1000 });
      out.push(...page.blobs.map((b) => ({ path: b.pathname, version: `${new Date(b.uploadedAt).getTime()}:${b.size}` })));
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return out;
  }
  const dir = localPath(prefix);
  try {
    const entries = await fs.readdir(dir, { recursive: true, withFileTypes: true });
    const files = entries.filter((e) => e.isFile()).map((e) => path.join(e.parentPath, e.name));
    return Promise.all(
      files.map(async (f) => {
        const st = await fs.stat(f);
        return { path: path.relative(LOCAL_ROOT, f).split(path.sep).join("/"), version: `${st.mtimeMs}:${st.size}` };
      }),
    );
  } catch {
    return [];
  }
}

/* parsed JSON by path + version, per server instance; a file is re-read only when its version changes */
type VersionCache = Map<string, { version: string; value: unknown }>;
const versioned: VersionCache = ((globalThis as { __medsertiVersioned?: VersionCache }).__medsertiVersioned ??= new Map());

/**
 * JSON for a file whose current version came from listVersions: served from memory when that exact
 * version was read before, so data stays as fresh as the listing while unchanged files cost no read.
 */
export async function getJsonVersion<T>(pathname: string, version: string): Promise<T | null> {
  const hit = versioned.get(pathname);
  if (hit && hit.version === version) return hit.value as T;
  const value = await getJson<T>(pathname);
  if (versioned.size > 20_000) versioned.clear();
  if (value) versioned.set(pathname, { version, value });
  return value;
}

function guessType(p: string) {
  const ext = p.split(".").pop()?.toLowerCase();
  return (
    { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", json: "application/json" }[
      ext ?? ""
    ] ?? "application/octet-stream"
  );
}
