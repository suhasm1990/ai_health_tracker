import { NextResponse } from "next/server";
import { getCredentials, saveTokens } from "@/lib/tokens";
import { invalidateApiCache } from "@/lib/googleHealthApi";
import { setSessionCookie, UserSession } from "@/lib/session";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL(`/?error=${encodeURIComponent(error)}`, request.url));
  }

  if (!code) {
    return NextResponse.redirect(new URL("/?error=missing_code", request.url));
  }

  const { clientId, clientSecret, redirectUri } = getCredentials();

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error("Token exchange failed:", errText);
      return NextResponse.redirect(new URL(`/?error=token_exchange_failed`, request.url));
    }

    const tokenData = await tokenRes.json();

    // Fetch userinfo immediately using the freshly granted access token
    let userInfo: any = null;
    try {
      const userinfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (userinfoRes.ok) {
        userInfo = await userinfoRes.json();
      }
    } catch (e) {
      console.warn("Could not fetch userinfo in OAuth callback:", e);
    }

    const sessionPayload: UserSession = {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: Date.now() + (tokenData.expires_in || 3600) * 1000,
      scopes: tokenData.scope ? tokenData.scope.split(" ") : [],
      is_demo_mode: false,
      user: userInfo
        ? {
            id: userInfo.sub,
            displayName: userInfo.name || userInfo.given_name || "Google User",
            email: userInfo.email || "",
            avatarUrl: userInfo.picture,
          }
        : undefined,
    };

    saveTokens(sessionPayload);
    invalidateApiCache();

    // Attach encrypted HTTP-only session cookie to the redirect response
    const response = NextResponse.redirect(new URL("/?connected=true", request.url));
    setSessionCookie(response, sessionPayload);

    return response;
  } catch (err) {
    console.error("OAuth callback error:", err);
    return NextResponse.redirect(new URL("/?error=oauth_error", request.url));
  }
}
