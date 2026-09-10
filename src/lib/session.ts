import crypto from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const SESSION_COOKIE_NAME = "gh_session";

export interface UserSession {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number; // epoch ms
  scopes?: string[];
  is_demo_mode?: boolean;
  user?: {
    id?: string;
    displayName?: string;
    email?: string;
    avatarUrl?: string;
  };
}

// Derive a consistent 32-byte key for AES-256-GCM from SESSION_SECRET, GOOGLE_CLIENT_SECRET, or a stable default
function getEncryptionKey(): Buffer {
  const secret =
    process.env.SESSION_SECRET ||
    process.env.GOOGLE_CLIENT_SECRET ||
    "google-health-default-secret-salt-2026";
  return crypto.createHash("sha256").update(secret).digest();
}

/**
 * Encrypts a session object into a compact, tamper-proof AES-256-GCM string.
 */
export function encryptSession(session: UserSession): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12); // Standard 12-byte IV for GCM
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const jsonStr = JSON.stringify(session);
  let encrypted = cipher.update(jsonStr, "utf8", "base64url");
  encrypted += cipher.final("base64url");

  const authTag = cipher.getAuthTag().toString("base64url");
  const ivStr = iv.toString("base64url");

  return `${ivStr}.${authTag}.${encrypted}`;
}

/**
 * Decrypts and verifies an AES-256-GCM session string.
 * Returns null if the token is invalid, expired, or tampered with.
 */
export function decryptSession(encryptedStr: string): UserSession | null {
  if (!encryptedStr || typeof encryptedStr !== "string") return null;

  try {
    const parts = encryptedStr.split(".");
    if (parts.length !== 3) return null;

    const [ivStr, authTagStr, ciphertext] = parts;
    const key = getEncryptionKey();
    const iv = Buffer.from(ivStr, "base64url");
    const authTag = Buffer.from(authTagStr, "base64url");

    if (iv.length !== 12 || authTag.length !== 16) return null;

    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext, "base64url", "utf8");
    decrypted += decipher.final("utf8");

    return JSON.parse(decrypted) as UserSession;
  } catch {
    return null;
  }
}

/**
 * Reads and decrypts the session cookie from incoming request headers.
 */
export async function getSession(): Promise<UserSession | null> {
  try {
    const cookieStore = await cookies();
    const cookieVal = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (!cookieVal) return null;
    return decryptSession(cookieVal);
  } catch {
    return null;
  }
}

/**
 * Writes an encrypted session cookie onto an outgoing Next.js response.
 */
export function setSessionCookie(res: NextResponse, session: UserSession): void {
  const encrypted = encryptSession(session);
  res.cookies.set(SESSION_COOKIE_NAME, encrypted, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days persistence
  });
}

/**
 * Clears the session cookie on an outgoing Next.js response.
 */
export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
