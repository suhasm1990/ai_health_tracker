import { NextResponse } from "next/server";
import { HttpError } from "./errors";

/** Health data is personal: never let proxies or the browser cache API responses. */
const NO_STORE = { "Cache-Control": "private, no-store" };

export function json<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status, headers: NO_STORE });
}

/** Maps HttpError subclasses to their status; anything else is a logged 500. */
export function errorResponse(err: unknown, fallback = "Request failed"): NextResponse {
  if (err instanceof HttpError) return json({ error: err.message }, err.status);
  console.error(fallback, err);
  return json({ error: err instanceof Error ? err.message : fallback }, 500);
}

export const flag = (url: URL, name: string): boolean => url.searchParams.get(name) === "true";
