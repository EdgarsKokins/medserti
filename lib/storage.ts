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

async function streamToBuffer(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  return Buffer.from(await new Response(stream).arrayBuffer());
}

export async function putBytes(pathname: string, data: Buffer, contentType: string): Promise<void> {
  if (useBlob) {
    await put(pathname, data, { access: "private", contentType, addRandomSuffix: false, allowOverwrite: true });
    return;
  }
  const p = localPath(pathname);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, data);
}

export async function getBytes(pathname: string): Promise<{ data: Buffer; contentType: string } | null> {
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
    const { blobs } = await list({ prefix: pathname, limit: 1000 });
    const urls = blobs.map((b) => b.url);
    if (urls.length) await del(urls);
    return;
  }
  await fs.rm(localPath(pathname), { recursive: true, force: true });
}

/** List pathnames under a prefix */
export async function listPaths(prefix: string): Promise<string[]> {
  if (useBlob) {
    const out: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await list({ prefix, cursor, limit: 1000 });
      out.push(...page.blobs.map((b) => b.pathname));
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return out;
  }
  const dir = localPath(prefix);
  try {
    const entries = await fs.readdir(dir, { recursive: true, withFileTypes: true });
    return entries
      .filter((e) => e.isFile())
      .map((e) => path.relative(LOCAL_ROOT, path.join(e.parentPath, e.name)).split(path.sep).join("/"));
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
