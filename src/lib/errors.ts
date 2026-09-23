/** An error that maps directly to an HTTP status when it reaches a route handler. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export class ValidationError extends HttpError {
  constructor(message: string) {
    super(400, message);
    this.name = "ValidationError";
  }
}

/** Thrown when a live request cannot be authorised. */
export class AuthError extends HttpError {
  constructor(message = "Not authenticated. Connect your Google account to load live data.") {
    super(401, message);
    this.name = "AuthError";
  }
}
