import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getCredentials } from "@/lib/tokens";
import { invalidateApiCache } from "@/lib/googleHealthApi";
import { setSessionCookie, UserSession } from "@/lib/session";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const state = url.searchParams.get("state");

  if (error) {
    return NextResponse.redirect(new URL(`/?error=${encodeURIComponent(error)}`, request.url));
  }

  // 1. Verify OAuth CSRF state parameter (RFC 6749 Section 10.12)
  const cookieStore = await cookies();
  const savedState = cookieStore.get("oauth_state")?.value;

  if (!state || !savedState || state !== savedState) {
    console.error("OAuth state mismatch - potential CSRF attack detected");
    const res = NextResponse.redirect(new URL("/?error=csrf_state_mismatch", request.url));
    res.cookies.set("oauth_state", "", { maxAge: 0, path: "/" });
    return res;
  }

  if (!code) {
    const res = NextResponse.redirect(new URL("/?error=missing_code", request.url));
    res.cookies.set("oauth_state", "", { maxAge: 0, path: "/" });
    return res;
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
      const res = NextResponse.redirect(new URL("/?error=token_exchange_failed", request.url));
      res.cookies.set("oauth_state", "", { maxAge: 0, path: "/" });
      return res;
    }

    const tokenData = await tokenRes.json();

    // Fetch user profile immediately using the freshly granted access token
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

    // Invalidate stale in-memory cached data
    invalidateApiCache();

    // Attach encrypted HTTP-only session cookie to the redirect response
    // Tokens are NEVER stored on the server file system or in global memory
    const response = NextResponse.redirect(new URL("/?connected=true", request.url));
    setSessionCookie(response, sessionPayload);

    // Consume and clear the one-time CSRF state cookie
    response.cookies.set("oauth_state", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });

    return response;
  } catch (err) {
    console.error("OAuth callback error:", err);
    const res = NextResponse.redirect(new URL("/?error=oauth_error", request.url));
    res.cookies.set("oauth_state", "", { maxAge: 0, path: "/" });
    return res;
  }
}
