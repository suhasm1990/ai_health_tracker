import { getPairedDevices } from "@/lib/health";
import { errorResponse, flag, json } from "@/lib/http";

export async function GET(request: Request) {
  try {
    return json({ devices: await getPairedDevices(flag(new URL(request.url), "refresh")) });
  } catch (err) {
    return errorResponse(err, "Failed to fetch paired devices");
  }
}
