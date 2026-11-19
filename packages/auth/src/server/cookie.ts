import { CompactEncrypt, compactDecrypt } from "jose";
import type { Player } from "../types";

/** What the session cookie holds. The browser cannot read it. */
export interface ServerSession {
  refreshToken: string;
  accessToken: string;
  /** PAT expiry, in milliseconds since the epoch. */
  expiresAt: number;
  player: Player;
}

export const DEFAULT_COOKIE_NAME = "exwave_session";
/** Matches the API's 30-day idle expiry; every refresh renews it. */
export const COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const encoder = new TextEncoder();

export interface CookieOptions {
  secure: boolean;
  maxAge?: number;
}

// Short keys: the sealed value plus attributes must stay under 4 KB.
interface Sealed {
  v: 1;
  iat: number;
  rt: string;
  at: string;
  exp: number;
  p: [string, string, string, boolean, string, string | null];
}

async function deriveKey(secret: string, name: string): Promise<Uint8Array> {
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    "HKDF",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: encoder.encode("exwave-auth/session-cookie"),
      info: encoder.encode(name),
    },
    material,
    256,
  );
  return new Uint8Array(bits);
}

/**
 * Seals sessions with JWE (`dir`, A256GCM) under keys derived from the
 * cookie secrets. The first secret seals; all of them open, for rotation.
 */
export function createCookieSealer(
  secrets: string | string[],
  cookieName: string,
  now: () => number = Date.now,
) {
  const list = Array.isArray(secrets) ? secrets : [secrets];
  if (
    list.length === 0 ||
    list.some((s) => typeof s !== "string" || s.length < 32)
  )
    throw new Error(
      "@exwave-nexus/auth: cookieSecret must be at least 32 characters (set EXWAVE_COOKIE_SECRET)",
    );
  const keys = Promise.all(list.map((s) => deriveKey(s, cookieName)));

  return {
    async seal(session: ServerSession): Promise<string> {
      const p = session.player;
      const body: Sealed = {
        v: 1,
        iat: Math.floor(now() / 1000),
        rt: session.refreshToken,
        at: session.accessToken,
        exp: session.expiresAt,
        p: [
          p.id,
          p.userId,
          p.email,
          p.emailVerified,
          p.displayName,
          p.username,
        ],
      };
      const [key] = await keys;
      return new CompactEncrypt(encoder.encode(JSON.stringify(body)))
        .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
        .encrypt(key as Uint8Array);
    },
    async unseal(
      value: string | null | undefined,
    ): Promise<ServerSession | null> {
      if (!value) return null;
      for (const key of await keys) {
        try {
          const { plaintext } = await compactDecrypt(value, key, {
            keyManagementAlgorithms: ["dir"],
            contentEncryptionAlgorithms: ["A256GCM"],
          });
          const body = JSON.parse(
            new TextDecoder().decode(plaintext),
          ) as Sealed;
          if (body.v !== 1) return null;
          if (body.iat + COOKIE_MAX_AGE_SECONDS < now() / 1000) return null;
          const [id, userId, email, emailVerified, displayName, username] =
            body.p;
          return {
            refreshToken: body.rt,
            accessToken: body.at,
            expiresAt: body.exp,
            player: { id, userId, email, emailVerified, displayName, username },
          };
        } catch {
          // Try the next secret.
        }
      }
      return null;
    },
  };
}

export function serializeCookie(
  name: string,
  value: string,
  options: CookieOptions,
): string {
  const maxAge = options.maxAge ?? COOKIE_MAX_AGE_SECONDS;
  return `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${options.secure ? "; Secure" : ""}`;
}

/** `Secure` everywhere except plain-HTTP localhost, where browsers would drop it. */
export function isSecureRequest(url: string | URL): boolean {
  const { protocol, hostname } = new URL(url);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
  return protocol === "https:" || !local;
}
