import { getAuthState } from "@/lib/auth";
import { coachStore } from "@/lib/coach/store";
import { guestId } from "@/lib/goals/guest";
import { errorResponse, json } from "@/lib/http";
import { isHabit } from "@/lib/journal/habits";
import { loadJournal } from "@/lib/journal/service";
import { isValidIsoDate, shiftIso, todayIso } from "@/lib/utils";

const tzParam = (value: string | null) => (value && value.length <= 64 ? value : undefined);

/** Recent journal entries, habit insights and the coach's memories. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const clientDate = url.searchParams.get("clientDate");
  try {
    return json(
      await loadJournal({
        state: await getAuthState(),
        clientDate: isValidIsoDate(clientDate) ? clientDate : undefined,
        clientTz: tzParam(url.searchParams.get("tz")),
        guestId: await guestId(),
      })
    );
  } catch (err) {
    return errorResponse(err, "Failed to load journal");
  }
}

/**
 * Body: { action: "log" | "unlog", date, habit, amount? } or { action: "forget", id }.
 * Dates may be up to two weeks back and never in the future.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const tz = tzParam(body?.tz);
  try {
    const store = coachStore(await getAuthState(), tz, await guestId());
    if (body?.action === "forget") {
      if (typeof body.id !== "string" || body.id.length > 64) return json({ error: "Missing memory id" }, 400);
      return (await store.forget(body.id)) ? json({ forgotten: true }) : json({ error: "Memory not found" }, 404);
    }
    const today = isValidIsoDate(body?.clientDate) ? body.clientDate : todayIso(tz);
    if (!isValidIsoDate(body?.date) || body.date > today || body.date < shiftIso(today, -14)) return json({ error: "date must be within the last two weeks" }, 400);
    if (!isHabit(body?.habit)) return json({ error: "Unknown habit" }, 400);
    if (body.action === "unlog") return json({ removed: await store.unlog(body.date, body.habit) });
    const amount = typeof body.amount === "number" && body.amount > 0 && body.amount < 100 ? body.amount : null;
    await store.log({ date: body.date, habit: body.habit, amount, note: null });
    return json({ saved: true });
  } catch (err) {
    return errorResponse(err, "Failed to update journal");
  }
}
