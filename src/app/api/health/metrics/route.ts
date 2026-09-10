import { NextResponse } from "next/server";
import { getAllHealthMetrics } from "@/lib/googleHealthApi";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const deviceId = url.searchParams.get("deviceId") || undefined;
    const forceRefresh = url.searchParams.get("refresh") === "true";

    const payload = await getAllHealthMetrics(deviceId, forceRefresh);
    return NextResponse.json(payload);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to fetch health metrics" }, { status: 500 });
  }
}
