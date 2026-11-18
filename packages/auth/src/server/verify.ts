import { createRemoteJWKSet, type JWTVerifyGetKey, jwtVerify } from "jose";
import { ExwaveAuthError } from "../errors";
import { decodePublishableKey } from "../publishable-key";
import type { PlayerAccessTokenClaims } from "../types";

export const PAT_ISSUER = "exwave-auth";
export const PAT_AUDIENCE = "exwave-player-services";
const ALGORITHMS = ["EdDSA", "ES256", "RS256"];

const jwksByOrigin = new Map<string, JWTVerifyGetKey>();

/** The Auth service's public PAT keys, cached per origin by `jose`. */
export function playerJwks(authOrigin: string): JWTVerifyGetKey {
  let jwks = jwksByOrigin.get(authOrigin);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL("/orbit/v1/jwks", authOrigin));
    jwksByOrigin.set(authOrigin, jwks);
  }
  return jwks;
}

export type VerifyTarget =
  | { publishableKey: string; jwks?: JWTVerifyGetKey }
  | { authOrigin: string; platformId: string; jwks?: JWTVerifyGetKey };

export interface VerifiedPlayer {
  /** The managed user ID, decoded from the subject. */
  userId: string;
  platformId: string;
  claims: PlayerAccessTokenClaims;
}

/**
 * Verifies a managed-auth PAT: signature against `/orbit/v1/jwks`, `iss`,
 * `aud`, expiry, `project_id`, and the `managed:<platform>:` subject.
 * Throws `ExwaveAuthError("invalid_token")` otherwise.
 */
export async function verifyPlayerAccessToken(
  token: string,
  target: VerifyTarget,
): Promise<VerifiedPlayer> {
  const { authOrigin, platformId } =
    "publishableKey" in target
      ? decodePublishableKey(target.publishableKey)
      : target;
  const platform = platformId.toLowerCase();
  let claims: PlayerAccessTokenClaims;
  try {
    const result = await jwtVerify<PlayerAccessTokenClaims>(
      token,
      target.jwks ?? playerJwks(authOrigin),
      { issuer: PAT_ISSUER, audience: PAT_AUDIENCE, algorithms: ALGORITHMS },
    );
    claims = result.payload;
  } catch {
    throw new ExwaveAuthError("invalid_token", 401);
  }
  const prefix = `managed:${platform}:`;
  if (
    claims.project_id !== platform ||
    typeof claims.sub !== "string" ||
    !claims.sub.startsWith(prefix) ||
    claims.sub.length === prefix.length ||
    (claims.token_use !== undefined && claims.token_use !== "player_access")
  )
    throw new ExwaveAuthError("invalid_token", 401);
  let userId: string;
  try {
    userId = decodeURIComponent(claims.sub.slice(prefix.length));
  } catch {
    throw new ExwaveAuthError("invalid_token", 401);
  }
  return { userId, platformId: platform, claims };
}
