import { getAuthState } from "@/lib/auth";
import { guestId } from "@/lib/goals/guest";
import { loadGoals, setSessionSkipped } from "@/lib/goals/service";
import { goalStore } from "@/lib/goals/store";
import { errorResponse, json } from "@/lib/http";
import { isValidIsoDate } from "@/lib/utils";

const tzParam = (url: URL) => {
  const tz = url.searchParams.get("tz");
  return tz && tz.length <= 64 ? tz : undefined;
};

/** Active goals with live progress, badges and nudges, plus suggestions for new ones. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const clientDate = url.searchParams.get("clientDate");
  try {
    return json(await loadGoals({ state: await getAuthState(), clientDate: isValidIsoDate(clientDate) ? clientDate : undefined, clientTz: tzParam(url), guestId: await guestId() }));
  } catch (err) {
    return errorResponse(err, "Failed to load goals");
  }
}

/** Archives one of the caller's own goals. */
export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id || id.length > 64) return json({ error: "Missing goal id" }, 400);
  try {
    const removed = await goalStore(await getAuthState(), tzParam(url), await guestId()).archive(id);
    return removed ? json({ archived: true }) : json({ error: "Goal not found" }, 404);
  } catch (err) {
    return errorResponse(err, "Failed to archive goal");
  }
}

/** Marks a planned run as skipped, or takes that back: `{ goalId?, date, skipped }`. */
export async function PATCH(request: Request) {
  const url = new URL(request.url);
  const body = (await request.json().catch(() => null)) as { goalId?: unknown; date?: unknown; skipped?: unknown } | null;
  const date = body?.date;
  if (!isValidIsoDate(date) || typeof body?.skipped !== "boolean") return json({ error: "Send a date (YYYY-MM-DD) and skipped (true or false)" }, 400);
  const goalId = typeof body.goalId === "string" && body.goalId.length <= 64 ? body.goalId : undefined;
  const clientDate = url.searchParams.get("clientDate");
  try {
    const result = await setSessionSkipped(
      { state: await getAuthState(), clientDate: isValidIsoDate(clientDate) ? clientDate : undefined, clientTz: tzParam(url), guestId: await guestId() },
      goalId,
      date,
      body.skipped
    );
    return result.ok ? json({ saved: true, skipped: body.skipped, date }) : json({ error: result.error }, result.status);
  } catch (err) {
    return errorResponse(err, "Failed to update the session");
  }
}
