import { NextResponse } from "next/server";
import { getPairedDevices } from "@/lib/googleHealthApi";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const forceRefresh = url.searchParams.get("refresh") === "true";
    const devices = await getPairedDevices(forceRefresh);
    return NextResponse.json({ devices });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to fetch paired devices" }, { status: 500 });
  }
}
