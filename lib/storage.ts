import "server-only";
import { put, get, del, list } from "@vercel/blob";
import { promises as fs } from "fs";
import path from "path";

/**
 * Uploaded files (users/<id>/files/<certId>/<name>). JSON records live in Redis (lib/records.ts).
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

function guessType(p: string) {
  const ext = p.split(".").pop()?.toLowerCase();
  return (
    { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", json: "application/json" }[
      ext ?? ""
    ] ?? "application/octet-stream"
  );
}
