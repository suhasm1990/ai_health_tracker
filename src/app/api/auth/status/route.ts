import { NextResponse } from "next/server";
import { getStoredTokens, getCredentials, saveTokens } from "@/lib/tokens";
import { getUserProfile, invalidateApiCache, GOOGLE_HEALTH_API_VERSION } from "@/lib/googleHealthApi";
import { resolveLlmConfig } from "@/lib/llm/agent";
import { getSession, setSessionCookie } from "@/lib/session";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const forceRefresh = url.searchParams.get("refresh") === "true";
  const tokens = await getStoredTokens();
  const { clientId, clientSecret } = getCredentials();
  const hasValidToken = Boolean(tokens.access_token);
  const user = await getUserProfile(forceRefresh);
  const llmConfig = resolveLlmConfig();

  return NextResponse.json({
    isAuthenticated: hasValidToken,
    isDemo: tokens.is_demo_mode ?? !hasValidToken,
    user,
    scopesGranted: tokens.scopes || [],
    hasCredentials: Boolean(clientId && clientSecret),
    clientId: clientId ? `${clientId.slice(0, 8)}...` : "",
    apiVersion: GOOGLE_HEALTH_API_VERSION,
    llm: {
      provider: llmConfig.provider,
      model: llmConfig.model,
      hasApiKey: Boolean(llmConfig.apiKey),
      apiKeyMasked: llmConfig.apiKey ? `${llmConfig.apiKey.slice(0, 6)}...${llmConfig.apiKey.slice(-4)}` : "",
    },
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (body.action === "toggle_demo") {
      const session = (await getSession()) || (await getStoredTokens());
      const updatedSession = { ...session, is_demo_mode: Boolean(body.isDemo) };
      const res = NextResponse.json({ success: true, isDemo: body.isDemo });
      setSessionCookie(res, updatedSession);
      saveTokens({ is_demo_mode: Boolean(body.isDemo) });
      invalidateApiCache();
      return res;
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: "Failed to update auth status" }, { status: 500 });
  }
}
