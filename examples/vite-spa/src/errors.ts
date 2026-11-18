import { isExwaveAuthError } from "@exwave/auth";

/** What to tell the player for each API error code. */
export function describeError(error: unknown): string {
  if (!isExwaveAuthError(error)) return "Something went wrong. Try again.";
  switch (error.code) {
    case "invalid_credentials":
      return "Wrong email, username or password.";
    case "email_not_verified":
      return "Verify your email first: open the link we sent you.";
    case "player_locked":
      return "This account is locked. Contact the game's support.";
    case "rate_limited":
      return `Too many attempts. Try again in ${
        error.retryAfter
          ? `${Math.ceil(error.retryAfter / 60)} min`
          : "a few minutes"
      }.`;
    case "email_taken":
      return "An account already uses this email. Sign in instead?";
    case "username_taken":
      return "This username is taken.";
    case "weak_password":
      return "Choose a stronger password: 8+ characters with upper case, lower case and a number.";
    case "invalid_code":
      return "This link has expired or was already used.";
    case "sign_up_disabled":
      return "Sign-up is closed for this game.";
    case "invalid_refresh_token":
      return "Your session ended. Sign in again.";
    case "network_error":
      return "Can't reach Exwave. Check your connection.";
    case "managed_auth_not_enabled":
      return "Managed auth is off for this platform in Nexus.";
    case "invalid_publishable_key":
      return "The publishable key is not valid. Copy it again from Nexus.";
    default:
      return `Something went wrong (${error.code}).`;
  }
}
