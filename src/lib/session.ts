import crypto from "crypto";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";

/**
 * Encrypted, HTTP-only session cookie (AES-256-GCM, HKDF-derived key).
 * Field names mirror Google's OAuth token response so callback mapping stays 1:1.
 */
export interface UserSession {
  access_token?: string;
  refresh_token?: string;
  /** epoch ms */
  expires_at?: number;
  scopes?: string[];
  is_demo_mode?: boolean;
  user?: {
    id?: string;
    displayName?: string;
    email?: string;
    avatarUrl?: string;
  };
}

export const SESSION_COOKIE = "gh_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge,
});

let encryptionKey: Buffer | undefined;

function getEncryptionKey(): Buffer {
  if (encryptionKey) return encryptionKey;
  const secret = process.env.SESSION_SECRET || process.env.GOOGLE_CLIENT_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET (or GOOGLE_CLIENT_SECRET) must be set in production to encrypt session cookies.");
  }
  encryptionKey = Buffer.from(
    crypto.hkdfSync("sha256", secret || "google-health-dev-local-secret", "google-health-salt", "session-encryption-key", 32)
  );
  return encryptionKey;
}

export function encryptSession(session: UserSession): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(session), "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((b) => b.toString("base64url")).join(".");
}

/** Returns null for missing, malformed or tampered tokens. */
export function decryptSession(token: string | undefined): UserSession | null {
  if (!token) return null;
  try {
    const [iv, tag, ciphertext] = token.split(".").map((part) => Buffer.from(part, "base64url"));
    if (iv?.length !== 12 || tag?.length !== 16 || !ciphertext) return null;
    const decipher = crypto.createDecipheriv("aes-256-gcm", getEncryptionKey(), iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    return JSON.parse(plain) as UserSession;
  } catch {
    return null;
  }
}

/** Reads the session from the incoming request; null outside a request context. */
export async function getSession(): Promise<UserSession | null> {
  try {
    return decryptSession((await cookies()).get(SESSION_COOKIE)?.value);
  } catch {
    return null;
  }
}

/** Merges fields into the current session cookie. Only works in Route Handlers / Server Actions. */
export async function updateSession(fields: Partial<UserSession>): Promise<boolean> {
  try {
    const session = await getSession();
    if (!session) return false;
    (await cookies()).set(SESSION_COOKIE, encryptSession({ ...session, ...fields }), cookieOptions(SESSION_MAX_AGE));
    return true;
  } catch {
    return false;
  }
}

export function setSessionCookie(res: NextResponse, session: UserSession): void {
  res.cookies.set(SESSION_COOKIE, encryptSession(session), cookieOptions(SESSION_MAX_AGE));
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE, "", cookieOptions(0));
}
