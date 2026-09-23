import crypto from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { OAUTH_STATE_COOKIE, clearOAuthStateCookie, exchangeCodeForSession } from "@/lib/auth";
import { setSessionCookie } from "@/lib/session";

const sameState = (a: string, b: string) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const redirectHome = (query: string) => {
    const res = NextResponse.redirect(new URL(`/?${query}`, request.url));
    clearOAuthStateCookie(res); // the state cookie is single-use
    return res;
  };

  const error = params.get("error");
  if (error) return redirectHome(`error=${encodeURIComponent(error)}`);

  const state = params.get("state");
  const expected = (await cookies()).get(OAUTH_STATE_COOKIE)?.value;
  if (!state || !expected || !sameState(state, expected)) {
    console.error("OAuth state mismatch: possible CSRF attempt");
    return redirectHome("error=csrf_state_mismatch");
  }

  const code = params.get("code");
  if (!code) return redirectHome("error=missing_code");

  try {
    const session = await exchangeCodeForSession(code);
    const res = redirectHome("connected=true");
    setSessionCookie(res, session);
    return res;
  } catch (err) {
    console.error("OAuth token exchange failed:", err);
    return redirectHome("error=token_exchange_failed");
  }
}
