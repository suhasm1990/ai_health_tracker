import { getAllHealthMetrics } from "@/lib/health";
import { errorResponse, flag, json } from "@/lib/http";

export async function GET(request: Request) {
  const url = new URL(request.url);
  try {
    const payload = await getAllHealthMetrics({
      forceRefresh: flag(url, "refresh"),
      clientDate: url.searchParams.get("clientDate") ?? undefined,
      clientTz: url.searchParams.get("tz") ?? undefined,
    });
    return json(payload);
  } catch (err) {
    return errorResponse(err, "Failed to fetch health metrics");
  }
}
