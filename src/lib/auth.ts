import type { NextResponse } from "next/server";
import { getSession, updateSession, cookieOptions, type UserSession } from "./session";
import { cached } from "./cache";
import { PROVIDER_LABELS, resolveLlmConfig } from "./llm/config";
import { API_VERSION } from "./health/client";
import type { AuthStatus, UserProfile } from "./types";

export { AuthError } from "./errors";

export const OAUTH_SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly",
  "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly",
  "https://www.googleapis.com/auth/googlehealth.sleep.readonly",
  "https://www.googleapis.com/auth/googlehealth.nutrition.readonly",
  "https://www.googleapis.com/auth/googlehealth.settings.readonly",
];

export const OAUTH_STATE_COOKIE = "oauth_state";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v3/userinfo";
const REFRESH_SKEW_MS = 2 * 60 * 1000;

export function getCredentials() {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  return {
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    redirectUri:
      process.env.GOOGLE_REDIRECT_URI || (host ? `https://${host}/api/auth/callback` : "http://localhost:3000/api/auth/callback"),
  };
}

export interface AuthState {
  session: UserSession | null;
  isAuthenticated: boolean;
  isDemo: boolean;
  /** Stable per-user cache namespace (Google subject id, else token suffix). */
  scope: string;
}

export async function getAuthState(): Promise<AuthState> {
  const session = await getSession();
  const isAuthenticated = Boolean(session?.access_token);
  return {
    session,
    isAuthenticated,
    isDemo: !isAuthenticated || Boolean(session?.is_demo_mode),
    scope: session?.user?.id || session?.access_token?.slice(-16) || "anon",
  };
}

export function setOAuthStateCookie(res: NextResponse, state: string): void {
  res.cookies.set(OAUTH_STATE_COOKIE, state, cookieOptions(60 * 10));
}

export function clearOAuthStateCookie(res: NextResponse): void {
  res.cookies.set(OAUTH_STATE_COOKIE, "", cookieOptions(0));
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
}

async function requestToken(params: Record<string, string>): Promise<TokenResponse> {
  const { clientId, clientSecret } = getCredentials();
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...params }),
  });
  if (!res.ok) throw new Error(`Token request failed (${res.status}): ${await res.text()}`);
  return res.json();
}

const expiresAt = (token: TokenResponse) => Date.now() + (token.expires_in ?? 3600) * 1000;

/** Exchanges an authorization code for a fully-populated session (profile included). */
export async function exchangeCodeForSession(code: string): Promise<UserSession> {
  const { redirectUri } = getCredentials();
  const token = await requestToken({ code, redirect_uri: redirectUri, grant_type: "authorization_code" });
  const profile = await fetchGoogleProfile(token.access_token);
  return {
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    expires_at: expiresAt(token),
    scopes: token.scope?.split(" ") ?? [],
    is_demo_mode: false,
    user: profile ?? undefined,
  };
}

// Collapse concurrent refreshes of the same token into one network call.
const refreshes = new Map<string, Promise<string | null>>();

async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  const pending = refreshes.get(refreshToken);
  if (pending) return pending;
  const promise = requestToken({ refresh_token: refreshToken, grant_type: "refresh_token" })
    .then(async (token) => {
      // Persisting the new token only works inside a Route Handler; elsewhere it is used for this request only.
      await updateSession({ access_token: token.access_token, expires_at: expiresAt(token) });
      return token.access_token;
    })
    .catch((err) => {
      console.error("Token refresh failed:", err);
      return null;
    })
    .finally(() => refreshes.delete(refreshToken));
  refreshes.set(refreshToken, promise);
  return promise;
}

/** Returns a usable access token, refreshing when it expires within two minutes. */
export async function getValidAccessToken(session: UserSession | null): Promise<string | null> {
  if (!session?.access_token) return null;
  const expiringSoon = session.expires_at !== undefined && session.expires_at - Date.now() < REFRESH_SKEW_MS;
  if (!expiringSoon) return session.access_token;
  return session.refresh_token ? refreshAccessToken(session.refresh_token) : null;
}

export async function fetchGoogleProfile(accessToken: string): Promise<UserProfile | null> {
  try {
    const res = await fetch(USERINFO_ENDPOINT, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      id: data.sub || "me",
      displayName: data.name || data.given_name || "Google Health User",
      email: data.email || "",
      avatarUrl: data.picture || undefined,
    };
  } catch (err) {
    console.error("Error fetching Google userinfo:", err);
    return null;
  }
}

/** Profile from the session when available, otherwise from Google (cached 5 minutes). */
export async function getUserProfile(state: AuthState, force = false): Promise<UserProfile | null> {
  const { session } = state;
  if (!session?.access_token) return null;
  if (session.user?.displayName && !force) {
    return { id: session.user.id || "me", displayName: session.user.displayName, email: session.user.email || "", avatarUrl: session.user.avatarUrl };
  }
  return cached(`${state.scope}:profile`, 5 * 60 * 1000, async () => {
    const token = await getValidAccessToken(session);
    return token ? fetchGoogleProfile(token) : null;
  }, { force });
}

/** The auth snapshot shared by the server-rendered page and /api/auth/status. */
export async function buildAuthStatus(force = false): Promise<AuthStatus> {
  const state = await getAuthState();
  const { clientId, clientSecret } = getCredentials();
  const llm = resolveLlmConfig();
  return {
    isAuthenticated: state.isAuthenticated,
    isDemo: state.isDemo,
    hasCredentials: Boolean(clientId && clientSecret),
    user: (await getUserProfile(state, force)) ?? undefined,
    scopesGranted: state.isAuthenticated ? state.session?.scopes ?? [] : [],
    apiVersion: API_VERSION,
    llm: { provider: PROVIDER_LABELS[llm.provider] ?? llm.provider, model: llm.model, hasApiKey: Boolean(llm.apiKey) },
  };
}
