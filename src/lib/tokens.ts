import { getSession, updateSession } from "./session";

export interface StoredTokens {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number; // epoch ms
  scopes?: string[];
  is_demo_mode?: boolean;
}

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
 * Synchronous token accessor for non-async helper contexts.
 * Always defaults safely to demo mode without leaking shared server state.
 */
export function getStoredTokensSync(): StoredTokens {
  return {
    is_demo_mode: true,
  };
}

/**
 * Primary token accessor: reads the user's isolated encrypted session cookie.
 * In a web request context, if no session cookie exists (e.g. Incognito mode or logged out),
 * it returns unauthenticated demo mode so that no other user's session is ever leaked.
 */
export async function getStoredTokens(): Promise<StoredTokens> {
  try {
    const session = await getSession();
    if (session?.access_token) {
      return {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: session.expires_at,
        scopes: session.scopes,
        is_demo_mode: session.is_demo_mode ?? false,
      };
    }
    if (session && session.is_demo_mode !== undefined) {
      return {
        is_demo_mode: session.is_demo_mode,
        scopes: session.scopes,
      };
    }
  } catch {
    // Expected when called outside Next.js request context (e.g. static build)
  }

  // Safe default: unauthenticated Demo Sandbox mode
  return {
    is_demo_mode: true,
  };
}

/**
 * Retained for backwards compatibility with existing route imports.
 * Server-side tokens are never saved to shared global files or memory to maintain strict tenant isolation.
 */
export function saveTokens(_tokens: Partial<StoredTokens>): void {
  // Intentional no-op: tokens are exclusively persisted inside client's encrypted session cookie
}

/**
 * Retained for backwards compatibility with existing route imports.
 * Session termination is handled via clearSessionCookie().
 */
export function clearTokens(): void {
  // Intentional no-op: cookie clearing handles session invalidation
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
    const newExpiresAt = Date.now() + (data.expires_in || 3600) * 1000;

    // Securely update session cookie if inside a Route Handler context
    try {
      await updateSession({
        access_token: data.access_token,
        expires_at: newExpiresAt,
      });
    } catch {
      // Ignore if called in a read-only Server Component context
    }

    return data.access_token;
  } catch (err) {
    console.error("Token refresh network error:", err);
    return null;
  }
}
