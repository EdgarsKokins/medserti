import "server-only";
import { jwtVerify } from "jose";
import { secret } from "../auth";

/**
 * User id from the session cookie, checked by signature only: no user read from storage, so an error report costs no
 * extra Blob operation. Only for tagging error reports; anything that grants access goes through lib/auth currentUser().
 */
export async function sessionUserId(cookieHeader: string | null | undefined): Promise<string | null> {
  const token = cookieHeader?.match(/(?:^|;\s*)cme_session=([^;]+)/)?.[1];
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}
