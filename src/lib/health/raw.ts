import { AuthError, getAuthState, getValidAccessToken } from "../auth";
import { invalidateCache } from "../cache";
import { ValidationError } from "../errors";
import { request, type ApiResult } from "./client";

const ALLOWED_METHODS = new Set(["GET", "POST", "PATCH", "DELETE"]);

/**
 * Proxies a request from the API Explorer to the Google Health API.
 * Only relative paths under the configured base URL are allowed, so the
 * server can never be pointed at another host.
 */
export async function executeRawApiCall(endpoint: string, method = "GET", body?: unknown): Promise<ApiResult> {
  const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  if (path.length > 512 || path.startsWith("//") || path.includes("..") || /[\s\\]/.test(path)) {
    throw new ValidationError("Invalid endpoint path.");
  }
  const verb = method.toUpperCase();
  if (!ALLOWED_METHODS.has(verb)) throw new ValidationError(`Unsupported method: ${method}`);

  const { session } = await getAuthState();
  const token = await getValidAccessToken(session);
  if (!token) throw new AuthError();

  const result = await request(token, path, verb, verb === "GET" ? undefined : body);
  if (verb !== "GET") invalidateCache();
  return result;
}
