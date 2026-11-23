/**
 * Why a user's nightly sync last failed, stored on the user row so the admin page can tell
 * a revoked Google token apart from a Google outage or a job that never ran.
 */
export type SyncErrorKind =
  /** Google answered `invalid_grant`: the user revoked access, changed their password, or the token expired. */
  | "token_revoked"
  /** The stored refresh token could not be decrypted, usually because SESSION_SECRET changed. */
  | "token_unreadable"
  /** Google rejected the app's own OAuth client (`invalid_client`, `unauthorized_client`). */
  | "app_credentials"
  /** Google's token endpoint failed for another reason, or could not be reached. */
  | "google_auth_error"
  /** Google Health returned nothing for days that already have data. */
  | "no_data"
  /** Anything else, such as a database error. */
  | "error";

export const SYNC_ERROR_KINDS: readonly SyncErrorKind[] = ["token_revoked", "token_unreadable", "app_credentials", "google_auth_error", "no_data", "error"];

/** Errors only the user can fix by signing in again. */
export const NEEDS_SIGN_IN: ReadonlySet<SyncErrorKind> = new Set(["token_revoked", "token_unreadable"]);

/** Longest detail kept, so a verbose error never bloats the users table. */
const MAX_DETAIL = 300;

export class SyncError extends Error {
  constructor(
    public readonly kind: SyncErrorKind,
    message: string
  ) {
    super(message);
    this.name = "SyncError";
  }
}

/** A failed call to Google's OAuth token endpoint, with the OAuth error code when Google sent one. */
export class TokenRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string | null,
    description: string | null
  ) {
    super(`Token request failed (${status})${code ? `: ${code}` : ""}${description ? ` (${description})` : ""}`);
    this.name = "TokenRequestError";
  }
}

/** Reads `{ error, error_description }` from a token endpoint error body, ignoring anything else in it. */
export function parseTokenError(status: number, body: string): TokenRequestError {
  try {
    const data = JSON.parse(body) as { error?: unknown; error_description?: unknown };
    const code = typeof data.error === "string" ? data.error : null;
    const description = typeof data.error_description === "string" ? data.error_description : null;
    return new TokenRequestError(status, code, description);
  } catch {
    return new TokenRequestError(status, null, null);
  }
}

export function classifySyncError(err: unknown): SyncErrorKind {
  if (err instanceof SyncError) return err.kind;
  if (err instanceof TokenRequestError) {
    if (err.code === "invalid_grant") return "token_revoked";
    if (err.code === "invalid_client" || err.code === "unauthorized_client") return "app_credentials";
    return "google_auth_error";
  }
  return "error";
}

export function syncErrorDetail(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.length > MAX_DETAIL ? `${message.slice(0, MAX_DETAIL - 1)}…` : message;
}

export const isSyncErrorKind = (value: unknown): value is SyncErrorKind => typeof value === "string" && (SYNC_ERROR_KINDS as readonly string[]).includes(value);
