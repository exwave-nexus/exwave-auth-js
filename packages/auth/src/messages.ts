// What to tell people: English defaults for every error, password rule and
// sign-out reason, with `{placeholders}`. Override any of them by key. No
// framework code here: React apps and plain scripts share it.
import type { SignOutReason } from "./client";
import { isExwaveAuthError } from "./errors";
import type { PasswordRule } from "./password";
import type { PasswordPolicy } from "./types";

export const defaultMessages = {
  "error.invalid_credentials": "Wrong email, username or password.",
  "error.email_not_verified":
    "Verify your email first: open the link we sent you.",
  "error.player_locked": "This account is locked. Contact support.",
  "error.rate_limited": "Too many attempts. Try again in {wait}.",
  "error.rate_limited.minutes": "{minutes} min",
  "error.rate_limited.later": "a few minutes",
  "error.email_taken": "An account already uses this email. Sign in instead?",
  "error.username_taken": "This username is taken.",
  "error.weak_password": "Your password needs {rules}.",
  "error.weak_password.unnamed":
    "This password isn't accepted. Choose a stronger one.",
  "error.invalid_code": "This link has expired or was already used.",
  "error.sign_up_disabled": "Sign-up is closed.",
  "error.invalid_refresh_token": "Your session ended. Sign in again.",
  "error.network_error": "Can't reach the server. Check your connection.",
  "error.invalid_redirect_to":
    "This site's address isn't allowed yet: add it to Redirect URLs in Nexus → Auth → Settings.",
  "error.managed_auth_unavailable":
    "Sign-in is unavailable right now. Try again in a moment.",
  "error.managed_auth_not_enabled":
    "Auth is turned off for this platform in Nexus.",
  "error.invalid_publishable_key":
    "The publishable key is not valid. Copy it again from Nexus.",
  "error.not_signed_in": "Sign in first.",
  "error.unknown": "Something went wrong ({code}).",
  "error.unexpected": "Something went wrong. Try again.",
  "rule.min_length": "at least {count} characters",
  "rule.min_length.unknown": "more characters",
  "rule.uppercase": "an uppercase letter (A–Z)",
  "rule.lowercase": "a lowercase letter (a–z)",
  "rule.number": "a number (0–9)",
  "rule.symbol": "a symbol (like ! or #)",
  "rule.join": ", ",
  "rule.join.last": " and ",
  "signOut.account_locked":
    "This account was locked, so you were signed out. Contact support.",
  "signOut.invalid_refresh_token":
    "Your session ended: you signed out everywhere or changed your password on another device, or it expired. Sign in again.",
  "signOut.signed_out_everywhere": "You signed out on every device.",
  "signOut.signed_out": "You signed out.",
} satisfies Record<string, string>;

export type MessageKey = keyof typeof defaultMessages;
/** Overrides by key. Strings only, so they can come from a Server Component. */
export type Messages = Partial<Record<MessageKey, string>> &
  Record<string, string>;

/** A message by key, with `{name}` placeholders filled in. */
export function formatMessage(
  key: MessageKey | (string & {}),
  values: Record<string, string | number> = {},
  messages?: Messages,
): string {
  const template =
    messages?.[key] ?? (defaultMessages as Record<string, string>)[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match,
  );
}

export interface DescribeOptions {
  /** The platform's policy, to say how many characters `min_length` needs. */
  policy?: PasswordPolicy | null;
  messages?: Messages;
}

/** One rule of the platform's password policy, as a phrase. */
export function describeRule(
  rule: PasswordRule,
  { policy, messages }: DescribeOptions = {},
): string {
  if (rule === "min_length")
    return policy?.minLength
      ? formatMessage("rule.min_length", { count: policy.minLength }, messages)
      : formatMessage("rule.min_length.unknown", {}, messages);
  return formatMessage(`rule.${rule}`, {}, messages);
}

/** Names the rules a password breaks, from `checkPassword()` or a 422's `failedRules`. */
export function describeWeakPassword(
  failed: PasswordRule[] | undefined,
  options: DescribeOptions = {},
): string {
  const { messages } = options;
  if (!failed?.length)
    return formatMessage("error.weak_password.unnamed", {}, messages);
  const parts = failed.map((rule) => describeRule(rule, options));
  const last = parts.pop();
  const rules = parts.length
    ? `${parts.join(formatMessage("rule.join", {}, messages))}${formatMessage("rule.join.last", {}, messages)}${last}`
    : (last ?? "");
  return formatMessage("error.weak_password", { rules }, messages);
}

export type Tone = "error" | "info" | "ok";

const SIGN_OUT_TONES: Record<SignOutReason, Tone> = {
  account_locked: "error",
  invalid_refresh_token: "info",
  signed_out_everywhere: "ok",
  signed_out: "ok",
};

/** Why the user was signed out, for the sign-in page. */
export function describeSignOut(
  reason: SignOutReason,
  { messages }: DescribeOptions = {},
): { text: string; tone: Tone } {
  return {
    text: formatMessage(`signOut.${reason}`, {}, messages),
    tone: SIGN_OUT_TONES[reason],
  };
}

/** What to tell the user about an error from any call. */
export function describeError(
  error: unknown,
  options: DescribeOptions = {},
): string {
  const { messages } = options;
  if (!isExwaveAuthError(error))
    return formatMessage("error.unexpected", {}, messages);
  if (error.code === "weak_password")
    return describeWeakPassword(error.failedRules, options);
  if (error.code === "rate_limited") {
    const wait = error.retryAfter
      ? formatMessage(
          "error.rate_limited.minutes",
          { minutes: Math.ceil(error.retryAfter / 60) },
          messages,
        )
      : formatMessage("error.rate_limited.later", {}, messages);
    return formatMessage("error.rate_limited", { wait }, messages);
  }
  const key = `error.${error.code}`;
  if ((messages && key in messages) || key in defaultMessages)
    return formatMessage(key, {}, messages);
  return formatMessage("error.unknown", { code: error.code }, messages);
}
