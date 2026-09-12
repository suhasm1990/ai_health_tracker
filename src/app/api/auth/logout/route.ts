import { NextResponse } from "next/server";
import { invalidateApiCache } from "@/lib/googleHealthApi";
import { clearSessionCookie } from "@/lib/session";

export async function POST() {
  invalidateApiCache();
  const res = NextResponse.json({ success: true, message: "Logged out and reset to demo mode." });
  clearSessionCookie(res);
  return res;
}
