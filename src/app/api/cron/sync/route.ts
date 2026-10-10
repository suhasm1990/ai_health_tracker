import crypto from "crypto";
import { syncAllUsers } from "@/lib/history";
import { errorResponse, json } from "@/lib/http";

/** Syncing every user can take a while; allow the platform maximum. */
export const maxDuration = 300;

const sameSecret = (a: string, b: string) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || !auth || !sameSecret(auth, `Bearer ${secret}`)) return json({ error: "Unauthorized" }, 401);

  try {
    return json(await syncAllUsers());
  } catch (err) {
    return errorResponse(err, "Cron sync failed");
  }
}
