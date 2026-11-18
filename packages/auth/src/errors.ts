/** Error codes the Exwave player API answers with, plus the client's own. */
export type ExwaveAuthErrorCode =
  | "managed_auth_not_enabled"
  | "sign_up_disabled"
  | "email_taken"
  | "username_taken"
  | "weak_password"
  | "invalid_code"
  | "invalid_credentials"
  | "email_not_verified"
  | "player_locked"
  | "rate_limited"
  | "invalid_refresh_token"
  | "invalid_request"
  | "unauthorized"
  | "unavailable"
  // Raised by this library, never by the API.
  | "invalid_publishable_key"
  | "network_error"
  | "invalid_response"
  | "not_signed_in"
  | "invalid_token"
  | "forbidden";

export class ExwaveAuthError extends Error {
  /** The API's `error` code, or one of the client codes above. */
  readonly code: ExwaveAuthErrorCode | (string & {});
  /** HTTP status of the failed call; 0 when the error never reached the API. */
  readonly status: number;
  /** Seconds to wait, from `Retry-After`, when the API rate limits. */
  readonly retryAfter: number | undefined;

  constructor(
    code: ExwaveAuthErrorCode | (string & {}),
    status = 0,
    retryAfter?: number,
  ) {
    super(code);
    this.name = "ExwaveAuthError";
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export function isExwaveAuthError(error: unknown): error is ExwaveAuthError {
  return error instanceof ExwaveAuthError;
}
