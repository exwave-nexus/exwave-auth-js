import { ExwaveAuthError } from "./errors";

const PREFIX = "exw_pk_";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

export interface PublishableKey {
  version: 1;
  /** Origin of the Exwave Auth service, such as `https://auth-prod.exwave.net`. */
  authOrigin: string;
  platformId: string;
}

/**
 * Reads a publishable key from Nexus: `exw_pk_` + base64url(`1|<auth origin>|<platform id>`).
 * The key holds no secret; it only tells the client where to send requests.
 */
export function decodePublishableKey(key: string): PublishableKey {
  const invalid = new ExwaveAuthError("invalid_publishable_key");
  if (typeof key !== "string" || !key.startsWith(PREFIX)) throw invalid;
  let text: string;
  try {
    text = atob(key.slice(PREFIX.length).replace(/-/g, "+").replace(/_/g, "/"));
  } catch {
    throw invalid;
  }
  const [version, origin, platformId, extra] = text.split("|");
  if (version !== "1" || extra !== undefined || !platformId) throw invalid;
  if (!UUID.test(platformId) || !origin) throw invalid;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    throw invalid;
  }
  const local = LOCAL_HOSTS.includes(url.hostname);
  const secure =
    url.protocol === "https:" || (local && url.protocol === "http:");
  if (!secure || url.origin !== origin.replace(/\/$/, "")) throw invalid;
  return {
    version: 1,
    authOrigin: url.origin,
    platformId: platformId.toLowerCase(),
  };
}

/** Builds a publishable key; Nexus does this for real platforms. */
export function encodePublishableKey(input: {
  authOrigin: string;
  platformId: string;
}): string {
  const raw = `1|${input.authOrigin}|${input.platformId}`;
  return (
    PREFIX +
    btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
  );
}
