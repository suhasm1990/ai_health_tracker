import { buildAuthStatus } from "@/lib/auth";
import { errorResponse, flag, json } from "@/lib/http";
import { getSession, setSessionCookie } from "@/lib/session";

export async function GET(request: Request) {
  try {
    return json(await buildAuthStatus(flag(new URL(request.url), "refresh")));
  } catch (err) {
    return errorResponse(err, "Failed to read auth status");
  }
}

/** Toggles the Demo Sandbox flag on the current session. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (body?.action !== "toggle_demo" || typeof body.isDemo !== "boolean") return json({ error: "Invalid action" }, 400);

  const res = json({ success: true, isDemo: body.isDemo });
  setSessionCookie(res, { ...((await getSession()) ?? {}), is_demo_mode: body.isDemo });
  return res;
}
