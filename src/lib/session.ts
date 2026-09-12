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

// Derive a high-entropy 32-byte key for AES-256-GCM using HKDF (RFC 5869)
function getEncryptionKey(): Buffer {
  const secret =
    process.env.SESSION_SECRET ||
    process.env.GOOGLE_CLIENT_SECRET;

  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "CRITICAL SECURITY CONFIGURATION ERROR: SESSION_SECRET or GOOGLE_CLIENT_SECRET must be set in production to encrypt session cookies."
      );
    }
    // Development-only deterministic secret fallback
    return Buffer.from(
      crypto.hkdfSync(
        "sha256",
        "google-health-dev-local-secret-key-salt-2026",
        "health-app-salt",
        "session-encryption-key",
        32
      )
    );
  }

  return Buffer.from(
    crypto.hkdfSync("sha256", secret, "google-health-salt", "session-encryption-key", 32)
  );
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
 * Updates the user's encrypted session cookie in a Route Handler or Server Action context.
 */
export async function updateSession(updatedFields: Partial<UserSession>): Promise<boolean> {
  try {
    const session = await getSession();
    if (!session) return false;
    const updated: UserSession = { ...session, ...updatedFields };
    const cookieStore = await cookies();
    const encrypted = encryptSession(updated);
    cookieStore.set(SESSION_COOKIE_NAME, encrypted, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });
    return true;
  } catch {
    return false;
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
