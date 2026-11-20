import { decodeJwtPayload } from "./api";
import type { PlayerAccessTokenClaims } from "./types";

export {
  type AuthChangeEvent,
  type AuthChangeInfo,
  type AuthChangeListener,
  createExwaveAuth,
  type ExwaveAuth,
  type ExwaveAuthClient,
  type ExwaveAuthOptions,
  REFRESH_MARGIN_MS,
  SIGN_OUT_REASON_TTL_MS,
  type SignOutReason,
} from "./client";
export {
  type EmailLinkParams,
  parseEmailLink,
  withoutEmailLink,
} from "./email-link";
export {
  ExwaveAuthError,
  type ExwaveAuthErrorCode,
  isExwaveAuthError,
} from "./errors";
export { checkPassword, type PasswordRule, passwordRules } from "./password";
export {
  decodePublishableKey,
  encodePublishableKey,
  type PublishableKey,
} from "./publishable-key";
export {
  createExwaveRouteClient,
  type ExwaveRouteClient,
  type ExwaveRouteClientOptions,
} from "./route-client";
export {
  memoryStorage,
  type StorageAdapter,
  type StorageOption,
} from "./storage";
export type * from "./types";

/** Reads a PAT's claims without verifying it. Verify on the server with `@exwave-nexus/auth/server`. */
export function decodePlayerAccessToken(
  token: string,
): PlayerAccessTokenClaims {
  return decodeJwtPayload<PlayerAccessTokenClaims>(token);
}
