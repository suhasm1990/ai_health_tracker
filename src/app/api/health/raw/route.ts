import { NextResponse } from "next/server";
import { executeRawApiCall } from "@/lib/googleHealthApi";

export async function POST(request: Request) {
  try {
    const { endpoint, method = "GET", body } = await request.json();

    if (!endpoint) {
      return NextResponse.json({ error: "Endpoint parameter is required" }, { status: 400 });
    }

    const result = await executeRawApiCall(endpoint, method, body);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Execution error" }, { status: 500 });
  }
}
