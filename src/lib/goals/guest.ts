import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { cookieOptions } from "../session";

const GUEST_COOKIE = "aht_guest";
const GUEST_MAX_AGE = 60 * 60 * 24 * 30;

/**
 * A random id for a browser that is not signed in, so demo goals belong to that visitor
 * instead of being shared by everyone on the same server. Route handlers only.
 */
export async function guestId(): Promise<string | undefined> {
  try {
    const jar = await cookies();
    const existing = jar.get(GUEST_COOKIE)?.value;
    if (existing && /^[\w-]{8,64}$/.test(existing)) return existing;
    const id = randomUUID();
    jar.set(GUEST_COOKIE, id, cookieOptions(GUEST_MAX_AGE));
    return id;
  } catch {
    // Outside a request (or cookies are read-only here): fall back to the shared demo scope.
    return undefined;
  }
}
