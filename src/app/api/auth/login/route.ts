import crypto from "crypto";
import { NextResponse } from "next/server";
import { OAUTH_SCOPES, getCredentials, setOAuthStateCookie } from "@/lib/auth";
import { json } from "@/lib/http";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";

export async function GET() {
  const { clientId, redirectUri } = getCredentials();
  if (!clientId) return json({ error: "Google Client ID is missing. Configure GOOGLE_CLIENT_ID in .env.local." }, 400);

  // Random state binds the callback to this browser (OAuth CSRF protection, RFC 6749 §10.12).
  const state = crypto.randomBytes(32).toString("hex");
  const url = new URL(AUTH_ENDPOINT);
  const params = {
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "select_account consent",
    scope: OAUTH_SCOPES.join(" "),
    state,
  };
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const res = NextResponse.redirect(url);
  setOAuthStateCookie(res, state);
  return res;
}
