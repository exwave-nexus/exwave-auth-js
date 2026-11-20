import { type ApiTokens, createPlayerApi, toUser } from "../api";
import {
  CONFIG_TTL_MS,
  REFRESH_MARGIN_MS,
  SIGN_OUT_REASON_TTL_MS,
  type SignOutReason,
  toSignOutReason,
} from "../client";
import { ExwaveAuthError, isExwaveAuthError } from "../errors";
import type {
  CodeInput,
  PasswordResetConfirmInput,
  PlatformConfig,
  SignInInput,
} from "../types";
import {
  COOKIE_MAX_AGE_SECONDS,
  createCookieSealer,
  DEFAULT_COOKIE_NAME,
  isSecureRequest,
  type ServerSession,
  serializeCookie,
} from "./cookie";
import { verifyPlayerAccessToken } from "./verify";

export type { SignOutReason } from "../client";
export { ExwaveAuthError, isExwaveAuthError } from "../errors";
export { checkPassword, type PasswordRule, passwordRules } from "../password";
export type * from "../types";
export {
  COOKIE_MAX_AGE_SECONDS,
  DEFAULT_COOKIE_NAME,
  isSecureRequest,
  type ServerSession,
  serializeCookie,
} from "./cookie";
export { handleAuthRequest } from "./handler";
export {
  PAT_AUDIENCE,
  PAT_ISSUER,
  playerJwks,
  type VerifiedPlayer,
  type VerifyTarget,
  verifyPlayerAccessToken,
} from "./verify";

export interface ExwaveServerAuthOptions {
  publishableKey: string;
  /** At least 32 characters. Pass several to rotate: the first one seals. */
  cookieSecret: string | string[];
  cookieName?: string;
  fetch?: typeof fetch;
  /** @internal */
  now?: () => number;
}

/**
 * What to do with the cookie after `refreshSession()`:
 * - `keep`: the PAT is still fresh;
 * - `write`: the refresh token rotated, so store the new session;
 * - `forward`: a concurrent request rotated it first (grace window). Use the
 *   new PAT for this request only: writing the old refresh token back could
 *   overwrite the newer cookie that request sets;
 * - `clear`: the session ended (revoked, reused or locked); `reason` says
 *   which, for the "signed out because" cookie.
 */
export type RefreshResult =
  | { session: ServerSession; cookie: "keep" | "write" | "forward" }
  | {
      session: null;
      cookie: "clear";
      error: ExwaveAuthError;
      reason: "invalid_refresh_token" | "account_locked";
    };

/** The "signed out because" cookie's lifetime: long enough for the sign-in page to read it. */
export const SIGN_OUT_REASON_MAX_AGE_SECONDS = SIGN_OUT_REASON_TTL_MS / 1000;

const SIGN_OUT_REASONS: Record<SignOutReason, true> = {
  signed_out: true,
  signed_out_everywhere: true,
  invalid_refresh_token: true,
  account_locked: true,
};

export const isSignOutReason = (value: unknown): value is SignOutReason =>
  typeof value === "string" && Object.hasOwn(SIGN_OUT_REASONS, value);

/** A cookie's value from a request's `Cookie` header. */
function cookieValue(request: Request, name: string): string | undefined {
  const header = request.headers.get("cookie") ?? "";
  const pair = header.split(/;\s*/).find((part) => part.startsWith(`${name}=`));
  return pair?.slice(name.length + 1);
}

export function createExwaveServerAuth(options: ExwaveServerAuthOptions) {
  const api = createPlayerApi(options.publishableKey, options.fetch);
  const now = options.now ?? Date.now;
  const cookieName = options.cookieName ?? DEFAULT_COOKIE_NAME;
  const reasonCookieName = `${cookieName}_signed_out`;
  const sealer = createCookieSealer(options.cookieSecret, cookieName, now);
  let config: { at: number; value: Promise<PlatformConfig> } | undefined;

  function toSession(tokens: ApiTokens, previous?: string): ServerSession {
    const refreshToken = tokens.refresh_token ?? previous;
    if (!refreshToken) throw new ExwaveAuthError("invalid_response");
    return {
      refreshToken,
      accessToken: tokens.access_token,
      expiresAt: now() + tokens.expires_in * 1000,
      user: toUser(tokens.player),
    };
  }

  const auth = {
    authOrigin: api.authOrigin,
    platformId: api.platformId,
    cookieName,
    /** Holds a `SignOutReason`, nothing secret, for 5 minutes after a session ends. */
    reasonCookieName,
    signUp: api.signUp,
    resendVerification: api.resendVerification,
    resetPassword: api.resetPassword,
    /** The platform's config, such as its password policy, cached for 60 s. */
    getConfig(): Promise<PlatformConfig> {
      if (!config || now() - config.at > CONFIG_TTL_MS) {
        const value = api.config();
        config = { at: now(), value };
        value.catch(() => {
          config = undefined;
        });
      }
      return config.value;
    },
    /** The user behind a PAT, from `players/me`. */
    getUser: api.me,
    async signIn(input: SignInInput) {
      return toSession(await api.signIn(input));
    },
    async verifyEmail(input: CodeInput) {
      return toSession(await api.verifyEmail(input));
    },
    async confirmPasswordReset(input: PasswordResetConfirmInput) {
      return toSession(await api.confirmPasswordReset(input));
    },
    signOut(session: ServerSession, { everywhere = false } = {}) {
      return api.signOut(session.refreshToken, everywhere);
    },
    /**
     * Refreshes when the PAT has under 60 s left (or always, with `force`).
     * Network and server errors are thrown; ended sessions are returned.
     */
    async refreshSession(
      session: ServerSession,
      { force = false } = {},
    ): Promise<RefreshResult> {
      if (!force && session.expiresAt - now() > REFRESH_MARGIN_MS)
        return { session, cookie: "keep" };
      try {
        const tokens = await api.refresh(session.refreshToken);
        return tokens.refresh_token
          ? { session: toSession(tokens), cookie: "write" }
          : {
              session: toSession(tokens, session.refreshToken),
              cookie: "forward",
            };
      } catch (error) {
        const reason = isExwaveAuthError(error)
          ? toSignOutReason(error.code)
          : undefined;
        if (reason)
          return {
            session: null,
            cookie: "clear",
            error: error as ExwaveAuthError,
            reason,
          };
        throw error;
      }
    },
    seal: sealer.seal,
    unseal: sealer.unseal,
    /** Reads the session from a request's `Cookie` header. */
    readCookie(request: Request): Promise<ServerSession | null> {
      return sealer.unseal(cookieValue(request, cookieName));
    },
    /** Why the request's last session ended, from the "signed out because" cookie. */
    readSignOutReason(request: Request): SignOutReason | null {
      const value = cookieValue(request, reasonCookieName);
      return isSignOutReason(value) ? value : null;
    },
    /** A `Set-Cookie` value holding the sealed session. */
    async sessionCookie(session: ServerSession, secure: boolean) {
      return serializeCookie(cookieName, await sealer.seal(session), {
        secure,
        maxAge: COOKIE_MAX_AGE_SECONDS,
      });
    },
    clearCookie(secure: boolean) {
      return serializeCookie(cookieName, "", { secure, maxAge: 0 });
    },
    /** A `Set-Cookie` value telling the sign-in page why the session ended. */
    signOutReasonCookie(reason: SignOutReason, secure: boolean) {
      return serializeCookie(reasonCookieName, reason, {
        secure,
        maxAge: SIGN_OUT_REASON_MAX_AGE_SECONDS,
      });
    },
    clearSignOutReasonCookie(secure: boolean) {
      return serializeCookie(reasonCookieName, "", { secure, maxAge: 0 });
    },
    isSecureRequest,
    /** Verifies a PAT for this platform. */
    verifyPlayerAccessToken: (token: string) =>
      verifyPlayerAccessToken(token, {
        authOrigin: api.authOrigin,
        platformId: api.platformId,
      }),
    now,
  };
  return auth;
}

export type ExwaveServerAuth = ReturnType<typeof createExwaveServerAuth>;
