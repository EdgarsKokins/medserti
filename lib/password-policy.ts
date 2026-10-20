import "server-only";
import { createHash } from "crypto";

/** bcrypt ignores everything after 72 bytes, so a longer password would silently match its own prefix */
export const MAX_PASSWORD_BYTES = 72;

export const passwordTooLong = (password: string) => Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES;

/**
 * True when the password appears in the HaveIBeenPwned breach corpus.
 * k-anonymity: only the first 5 hex chars of the SHA-1 leave the server; the match runs locally.
 * Fails open: if the API is slow or down, the password is allowed.
 */
export async function passwordBreached(password: string): Promise<boolean> {
  const hash = createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);
  try {
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "Add-Padding": "true", "User-Agent": "medserti.lv" },
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
    });
    if (!res.ok) return false;
    const body = await res.text();
    return body.split("\n").some((line) => {
      const [s, count] = line.trim().split(":");
      return s === suffix && Number(count) > 0; // padding rows have count 0
    });
  } catch (e) {
    console.warn("[password-policy] HIBP check skipped", e);
    return false;
  }
}
