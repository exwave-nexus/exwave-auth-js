import { createPlayerApi, toPlayer } from "../api";
import { REFRESH_MARGIN_MS } from "../client";
import { ExwaveAuthError, isExwaveAuthError } from "../errors";
import type {
  ApiTokens,
  CodeInput,
  PasswordResetConfirmInput,
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

export { ExwaveAuthError, isExwaveAuthError } from "../errors";
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
 * - `clear`: the session ended (revoked, reused or locked).
 */
export type RefreshResult =
  | { session: ServerSession; cookie: "keep" | "write" | "forward" }
  | { session: null; cookie: "clear"; error: ExwaveAuthError };

export function createExwaveServerAuth(options: ExwaveServerAuthOptions) {
  const api = createPlayerApi(options.publishableKey, options.fetch);
  const now = options.now ?? Date.now;
  const cookieName = options.cookieName ?? DEFAULT_COOKIE_NAME;
  const sealer = createCookieSealer(options.cookieSecret, cookieName, now);

  function toSession(tokens: ApiTokens, previous?: string): ServerSession {
    const refreshToken = tokens.refresh_token ?? previous;
    if (!refreshToken) throw new ExwaveAuthError("invalid_response");
    return {
      refreshToken,
      accessToken: tokens.access_token,
      expiresAt: now() + tokens.expires_in * 1000,
      player: toPlayer(tokens.player),
    };
  }

  const auth = {
    authOrigin: api.authOrigin,
    platformId: api.platformId,
    cookieName,
    signUp: api.signUp,
    resendVerification: api.resendVerification,
    resetPassword: api.resetPassword,
    getConfig: api.config,
    /** `players/me` with a PAT. */
    getPlayer: api.me,
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
        if (
          isExwaveAuthError(error) &&
          (error.code === "invalid_refresh_token" ||
            error.code === "player_locked")
        )
          return { session: null, cookie: "clear", error };
        throw error;
      }
    },
    seal: sealer.seal,
    unseal: sealer.unseal,
    /** Reads the session from a request's `Cookie` header. */
    readCookie(request: Request): Promise<ServerSession | null> {
      const header = request.headers.get("cookie") ?? "";
      const pair = header
        .split(/;\s*/)
        .find((part) => part.startsWith(`${cookieName}=`));
      return sealer.unseal(pair?.slice(cookieName.length + 1));
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
