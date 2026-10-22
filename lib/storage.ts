import "server-only";
import { put, get, del, list, BlobPreconditionFailedError } from "@vercel/blob";
import { createHash } from "crypto";
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
 * get = simple operation; get-cdn = simple operation only on a CDN cache miss; put and list = advanced operation; del = free
 */
const trace = (op: "get" | "get-cdn" | "put" | "list" | "del", path: string) => {
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

/**
 * Reads go to origin storage by default, so they always see the latest write.
 * `immutable: true` lets the read come from Vercel's CDN cache instead (a hit costs no operation):
 * only for paths that are written once and never overwritten, such as uploaded certificate files.
 */
export async function getBytes(pathname: string, opts: { immutable?: boolean } = {}): Promise<{ data: Buffer; contentType: string } | null> {
  trace(opts.immutable ? "get-cdn" : "get", pathname);
  if (useBlob) {
    const res = await get(pathname, { access: "private", useCache: !!opts.immutable });
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

/** Delete every file under a prefix that matches: one list for the lot, where remove() lists once per prefix */
export async function removeWhere(prefix: string, match: (pathname: string) => boolean): Promise<void> {
  if (useBlob) {
    let cursor: string | undefined;
    do {
      trace("list", prefix);
      const page = await list({ prefix, cursor, limit: 1000 });
      const urls = page.blobs.filter((b) => match(b.pathname)).map((b) => b.url);
      if (urls.length) trace("del", `${prefix} (${urls.length})`);
      if (urls.length) await del(urls);
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return;
  }
  trace("list", prefix);
  trace("del", prefix);
  for (const { path: p } of await listLocal(prefix)) if (match(p)) await fs.rm(localPath(p), { force: true });
}

/* ---------- conditional writes: read-modify-write without losing a concurrent update ---------- */

const sha1 = (b: Buffer) => createHash("sha1").update(b).digest("hex");

/** JSON plus a tag of the version read, for putJsonIfMatch */
export async function getJsonTagged<T>(pathname: string): Promise<{ value: T; etag: string } | null> {
  trace("get", pathname);
  if (useBlob) {
    const res = await get(pathname, { access: "private", useCache: false });
    if (!res || res.statusCode !== 200) return null;
    // larger files come back compressed with a weak ETag (W/"…"), which ifMatch never matches; the tag inside is the same
    return { value: JSON.parse((await streamToBuffer(res.stream)).toString("utf8")) as T, etag: res.blob.etag.replace(/^W\//, "") };
  }
  const data = await fs.readFile(localPath(pathname)).catch(() => null);
  return data ? { value: JSON.parse(data.toString("utf8")) as T, etag: sha1(data) } : null;
}

/* local mode: one compare-and-write at a time per path, so the check and the write are atomic within this process */
const localLocks = new Map<string, Promise<unknown>>();

/**
 * Write only if the file still has the version read (etag from getJsonTagged), or with etag null, only if it does not
 * exist yet. Returns false when another write got there first: read again and retry.
 */
export async function putJsonIfMatch(pathname: string, value: unknown, etag: string | null): Promise<boolean> {
  trace("put", pathname);
  const data = Buffer.from(JSON.stringify(value));
  if (useBlob) {
    const base = { access: "private", contentType: "application/json", addRandomSuffix: false } as const;
    try {
      await put(pathname, data, etag ? { ...base, ifMatch: etag } : { ...base, allowOverwrite: false });
      return true;
    } catch (err) {
      if (err instanceof BlobPreconditionFailedError) return false;
      // a create-only put that fails because the file now exists is a lost race, not an error
      if (!etag && (await getBytes(pathname))) return false;
      throw err;
    }
  }
  const run = (localLocks.get(pathname) ?? Promise.resolve()).then(async () => {
    const p = localPath(pathname);
    const cur = await fs.readFile(p).catch(() => null);
    if ((cur ? sha1(cur) : null) !== etag) return false;
    await fs.mkdir(path.dirname(p), { recursive: true });
    // temp file + rename: a reader never sees a half-written file (Blob writes are atomic too)
    const tmp = `${p}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, data);
    await fs.rename(tmp, p);
    return true;
  });
  const tail = run.catch(() => {});
  localLocks.set(pathname, tail);
  void tail.then(() => localLocks.get(pathname) === tail && localLocks.delete(pathname));
  return run;
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
  return listLocal(prefix);
}

async function listLocal(prefix: string): Promise<{ path: string; version: string }[]> {
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
 * JSON for a file whose current version came from listVersions or a manifest: served from memory when that exact
 * version was read before, so data stays as fresh as the listing while unchanged files cost no read.
 */
export async function getJsonVersion<T>(pathname: string, version: string, isVersion?: (value: T) => boolean): Promise<T | null> {
  const hit = versioned.get(pathname);
  if (hit && hit.version === version) return hit.value as T;
  const value = await getJson<T>(pathname);
  if (versioned.size > 20_000) versioned.clear();
  // isVersion: the file may already be newer than the version asked for (read during a write); never cache it under the old tag
  if (value && (!isVersion || isVersion(value))) versioned.set(pathname, { version, value });
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
