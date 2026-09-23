import { getAuthState } from "@/lib/auth";
import { invalidateCache } from "@/lib/cache";
import { json } from "@/lib/http";
import { clearSessionCookie } from "@/lib/session";

export async function POST() {
  const { scope } = await getAuthState();
  invalidateCache(`${scope}:`);
  const res = json({ success: true, message: "Logged out and reset to demo mode." });
  clearSessionCookie(res);
  return res;
}
