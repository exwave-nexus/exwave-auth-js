import {
  isExwaveAuthError,
  type PasswordPolicy,
  type PasswordRule,
  type SignOutReason,
} from "@exwave-nexus/auth";

/** One rule of the platform's password policy, as a phrase. */
export function describeRule(
  rule: PasswordRule,
  policy?: PasswordPolicy | null,
): string {
  switch (rule) {
    case "min_length":
      return policy?.minLength
        ? `at least ${policy.minLength} characters`
        : "more characters";
    case "uppercase":
      return "an uppercase letter (A–Z)";
    case "lowercase":
      return "a lowercase letter (a–z)";
    case "number":
      return "a number (0–9)";
    case "symbol":
      return "a symbol (like ! or #)";
  }
}

/** Names the rules a password breaks, from `checkPassword()` or a 422's `failedRules`. */
export function describeWeakPassword(
  failed: PasswordRule[] | undefined,
  policy?: PasswordPolicy | null,
): string {
  if (!failed?.length)
    return "This password isn't accepted. Choose a stronger one.";
  const parts = failed.map((rule) => describeRule(rule, policy));
  const last = parts.pop();
  return `Your password needs ${parts.length ? `${parts.join(", ")} and ${last}` : last}.`;
}

/** Why the player was signed out, for the sign-in page. */
export function describeSignOut(reason: SignOutReason): {
  text: string;
  tone: "error" | "info" | "ok";
} {
  switch (reason) {
    case "player_locked":
      return {
        text: "This account was locked, so you were signed out. Contact the game's support.",
        tone: "error",
      };
    case "invalid_refresh_token":
      return {
        text: "Your session ended: you signed out everywhere or changed your password on another device, or it expired. Sign in again.",
        tone: "info",
      };
    case "signed_out_everywhere":
      return { text: "You signed out on every device.", tone: "ok" };
    case "signed_out":
      return { text: "You signed out.", tone: "ok" };
  }
}

/** What to tell the player for each API error code. */
export function describeError(
  error: unknown,
  policy?: PasswordPolicy | null,
): string {
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
      return describeWeakPassword(error.failedRules, policy);
    case "invalid_code":
      return "This link has expired or was already used.";
    case "sign_up_disabled":
      return "Sign-up is closed for this game.";
    case "invalid_refresh_token":
      return "Your session ended. Sign in again.";
    case "network_error":
      return "Can't reach Exwave. Check your connection.";
    case "invalid_redirect_to":
      return "This site's address isn't in the platform's redirect URLs in Nexus.";
    case "managed_auth_unavailable":
      return "Sign-in is unavailable right now. Try again in a moment.";
    case "managed_auth_not_enabled":
      return "Managed auth is off for this platform in Nexus.";
    case "invalid_publishable_key":
      return "The publishable key is not valid. Copy it again from Nexus.";
    default:
      return `Something went wrong (${error.code}).`;
  }
}
