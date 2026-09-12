import crypto from "crypto";
import { NextResponse } from "next/server";
import { getCredentials } from "@/lib/tokens";

export async function GET(request: Request) {
  const { clientId, redirectUri } = getCredentials();

  if (!clientId) {
    return NextResponse.json(
      {
        error: "Google Client ID is missing. Please configure GOOGLE_CLIENT_ID in .env.local or in App Settings.",
      },
      { status: 400 }
    );
  }

  const scopes = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly",
    "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly",
    "https://www.googleapis.com/auth/googlehealth.sleep.readonly",
    "https://www.googleapis.com/auth/googlehealth.nutrition.readonly",
    "https://www.googleapis.com/auth/googlehealth.settings.readonly",
  ];

  // Cryptographically secure state parameter to prevent OAuth CSRF / session fixation attacks (RFC 6749 Section 10.12)
  const state = crypto.randomBytes(32).toString("hex");

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "select_account consent");
  authUrl.searchParams.set("scope", scopes.join(" "));
  authUrl.searchParams.set("state", state);

  const response = NextResponse.redirect(authUrl.toString());
  response.cookies.set("oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10, // 10 minutes expiry
  });

  return response;
}
