import { executeRawApiCall } from "@/lib/health";
import { errorResponse, json } from "@/lib/http";

/** API Explorer proxy: forwards a request to Google Health and mirrors the upstream status code. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (typeof body?.endpoint !== "string" || !body.endpoint.trim()) return json({ error: "Endpoint parameter is required" }, 400);

  try {
    const result = await executeRawApiCall(body.endpoint.trim(), typeof body.method === "string" ? body.method : "GET", body.body);
    return json(result.data, result.status);
  } catch (err) {
    return errorResponse(err, "Execution error");
  }
}
