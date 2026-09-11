import fs from "fs";
import path from "path";
import os from "os";
import { getSession } from "./session";

const IS_SERVERLESS = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const TOKEN_FILE_PATH = IS_SERVERLESS
  ? path.join(os.tmpdir(), ".tokens.json")
  : path.join(process.cwd(), ".tokens.json");

export interface StoredTokens {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number; // epoch ms
  scopes?: string[];
  is_demo_mode?: boolean;
}

// In-memory token cache fallback
let memoryTokenCache: StoredTokens = {
  is_demo_mode: false,
};

export function getCredentials(): { clientId: string; clientSecret: string; redirectUri: string } {
  let redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!redirectUri) {
    if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
      redirectUri = `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}/api/auth/callback`;
    } else if (process.env.VERCEL_URL) {
      redirectUri = `https://${process.env.VERCEL_URL}/api/auth/callback`;
    } else {
      redirectUri = "http://localhost:3000/api/auth/callback";
    }
  }
  return {
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    redirectUri,
  };
}

/**
 * Synchronously reads tokens from memory / .tokens.json for sync helper functions.
 */
export function getStoredTokensSync(): StoredTokens {
  try {
    if (fs.existsSync(TOKEN_FILE_PATH)) {
      const data = fs.readFileSync(TOKEN_FILE_PATH, "utf-8");
      return { ...memoryTokenCache, ...JSON.parse(data) };
    }
  } catch (err) {
    console.error("Error reading token file:", err);
  }
  return memoryTokenCache;
}

/**
 * Primary token accessor: reads the user's isolated encrypted session cookie first,
 * then falls back to local disk tokens for headless CLI contexts.
 */
export async function getStoredTokens(): Promise<StoredTokens> {
  // 1. Check user-specific encrypted session cookie
  try {
    const session = await getSession();
    if (session) {
      return {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: session.expires_at,
        scopes: session.scopes,
        is_demo_mode: session.is_demo_mode ?? false,
      };
    }
  } catch {
    // Expected when called outside Next.js request context
  }

  // 2. Fallback to local dev disk tokens
  return getStoredTokensSync();
}

export function saveTokens(tokens: Partial<StoredTokens>): void {
  try {
    const existing = getStoredTokensSync();
    const updated = { ...existing, ...tokens };
    memoryTokenCache = updated;
    fs.writeFileSync(TOKEN_FILE_PATH, JSON.stringify(updated, null, 2), "utf-8");
  } catch (err: any) {
    if (err?.code !== "EROFS") {
      console.warn("Could not persist token file to disk (using in-memory):", err?.message || err);
    }
    memoryTokenCache = { ...memoryTokenCache, ...tokens };
  }
}

export function clearTokens(): void {
  try {
    memoryTokenCache = { is_demo_mode: false };
    if (fs.existsSync(TOKEN_FILE_PATH)) {
      fs.unlinkSync(TOKEN_FILE_PATH);
    }
  } catch (err) {
    console.error("Error clearing token file:", err);
  }
}

export async function getValidAccessToken(): Promise<string | null> {
  const tokens = await getStoredTokens();
  if (!tokens.access_token) {
    return null;
  }

  // Check if token expires in less than 2 minutes
  const now = Date.now();
  if (tokens.expires_at && tokens.expires_at - now < 120 * 1000) {
    if (tokens.refresh_token) {
      const refreshed = await refreshAccessToken(tokens.refresh_token);
      return refreshed;
    }
    return null;
  }

  return tokens.access_token;
}

export async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  const { clientId, clientSecret } = getCredentials();
  if (!clientId || !clientSecret) {
    console.warn("Cannot refresh token without clientId and clientSecret");
    return null;
  }

  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) {
      console.error("Failed to refresh token:", await response.text());
      return null;
    }

    const data = await response.json();
    saveTokens({
      access_token: data.access_token,
      expires_at: Date.now() + (data.expires_in || 3600) * 1000,
    });

    return data.access_token;
  } catch (err) {
    console.error("Token refresh network error:", err);
    return null;
  }
}
