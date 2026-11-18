import { beforeAll, describe, expect, test } from "bun:test";
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWTVerifyGetKey,
  SignJWT,
} from "jose";
import { verifyPlayerAccessToken } from "./verify";

const PLATFORM = "6f1c2a10-5a3e-4c2b-9d4e-0a1b2c3d4e5f";
const OTHER = "11111111-2222-4333-8444-555555555555";
let privateKey: CryptoKey;
let jwks: JWTVerifyGetKey;

beforeAll(async () => {
  const pair = await generateKeyPair("EdDSA", { extractable: true });
  privateKey = pair.privateKey;
  jwks = createLocalJWKSet({
    keys: [{ ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "EdDSA" }],
  });
});

function pat(overrides: Record<string, unknown> = {}, expiresIn = 900) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    iss: "exwave-auth",
    aud: "exwave-player-services",
    sub: `managed:${PLATFORM}:312345678901234567`,
    project_id: PLATFORM,
    auth_method: "managed",
    token_use: "player_access",
    iat: now,
    exp: now + expiresIn,
    ...overrides,
  })
    .setProtectedHeader({ alg: "EdDSA", kid: "k1" })
    .sign(privateKey);
}

const target = () => ({
  authOrigin: "https://auth.example.test",
  platformId: PLATFORM,
  jwks,
});

describe("verifyPlayerAccessToken", () => {
  test("accepts a managed PAT for this platform", async () => {
    const result = await verifyPlayerAccessToken(await pat(), target());
    expect(result.userId).toBe("312345678901234567");
    expect(result.platformId).toBe(PLATFORM);
    expect(result.claims.auth_method).toBe("managed");
  });

  test("decodes an encoded user ID", async () => {
    const token = await pat({ sub: `managed:${PLATFORM}:a%3Ab` });
    expect((await verifyPlayerAccessToken(token, target())).userId).toBe("a:b");
  });

  for (const [name, claims, expiresIn] of [
    ["another issuer", { iss: "someone-else" }],
    ["another audience", { aud: "exwave-orbit" }],
    ["another platform's project_id", { project_id: OTHER }],
    ["another platform's subject", { sub: `managed:${OTHER}:1` }],
    ["a non-managed subject", { sub: `steam:${PLATFORM}:1` }],
    ["an empty user ID", { sub: `managed:${PLATFORM}:` }],
    ["another token use", { token_use: "orbit_session" }],
    ["an expired token", {}, -10],
  ] as const)
    test(`rejects ${name}`, async () => {
      const token = await pat(claims, expiresIn ?? 900);
      const failure = await verifyPlayerAccessToken(token, target()).catch(
        (e) => e,
      );
      expect(failure).toMatchObject({ code: "invalid_token", status: 401 });
    });

  test("rejects a token signed by another key", async () => {
    const other = await generateKeyPair("EdDSA");
    const token = await new SignJWT({ project_id: PLATFORM })
      .setProtectedHeader({ alg: "EdDSA", kid: "k1" })
      .setIssuer("exwave-auth")
      .setAudience("exwave-player-services")
      .setSubject(`managed:${PLATFORM}:1`)
      .setExpirationTime("15m")
      .sign(other.privateKey);
    const failure = await verifyPlayerAccessToken(token, target()).catch(
      (e) => e,
    );
    expect(failure.code).toBe("invalid_token");
  });
});
