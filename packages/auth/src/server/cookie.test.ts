import { describe, expect, test } from "bun:test";
import { generateKeyPair, SignJWT } from "jose";
import {
  COOKIE_MAX_AGE_SECONDS,
  createCookieSealer,
  type ServerSession,
  serializeCookie,
} from "./cookie";

const SECRET = "a-test-cookie-secret-of-32-chars!!";
const PLATFORM = "6f1c2a10-5a3e-4c2b-9d4e-0a1b2c3d4e5f";

// A PAT shaped like Auth's: EdDSA, the same claims, the longest subject.
async function realisticPat() {
  const { privateKey } = await generateKeyPair("EdDSA");
  const iat = Math.floor(Date.now() / 1000);
  return new SignJWT({
    project_id: PLATFORM,
    organization_id: "290000000000000001",
    auth_method: "managed",
    token_use: "player_access",
    jti: crypto.randomUUID(),
  })
    .setProtectedHeader({ alg: "EdDSA", kid: "k".repeat(43), typ: "JWT" })
    .setIssuer("exwave-auth")
    .setAudience("exwave-player-services")
    .setSubject(`managed:${PLATFORM}:${encodeURIComponent("3".repeat(18))}`)
    .setIssuedAt(iat)
    .setExpirationTime(iat + 900)
    .sign(privateKey);
}

async function session(overrides: Partial<ServerSession["user"]> = {}) {
  return {
    refreshToken: `exw_rt_${"x".repeat(43)}`,
    accessToken: await realisticPat(),
    expiresAt: Date.now() + 900_000,
    user: {
      id: `managed:${PLATFORM}:${"3".repeat(18)}`,
      userId: "3".repeat(18),
      email: "player@example.com",
      emailVerified: true,
      displayName: "Test Player",
      username: "player1",
      ...overrides,
    },
  } satisfies ServerSession;
}

describe("sealed session cookie", () => {
  test("round-trips and hides its contents", async () => {
    const sealer = createCookieSealer(SECRET, "exwave_session");
    const input = await session();
    const sealed = await sealer.seal(input);
    expect(sealed.split(".")).toHaveLength(5);
    expect(sealed).not.toContain("exw_rt_");
    expect(await sealer.unseal(sealed)).toEqual(input);
  });

  test("stays under 4 KB with the largest player we accept", async () => {
    const sealer = createCookieSealer(SECRET, "exwave_session");
    const largest = await session({
      // 254 is the longest valid address; 4-byte characters fill 64 chars of name.
      email: `${"e".repeat(64)}@${"d".repeat(185)}.test`,
      displayName: "🎮".repeat(64),
      username: "u".repeat(32),
    });
    const header = serializeCookie(
      "exwave_session",
      await sealer.seal(largest),
      {
        secure: true,
      },
    );
    const bytes = new TextEncoder().encode(header).length;
    expect(bytes).toBeLessThan(4096);
    const typical = serializeCookie(
      "exwave_session",
      await sealer.seal(await session()),
      { secure: true },
    );
    console.log(
      `session cookie: ${typical.length} B typical, ${bytes} B largest (limit 4096 B)`,
    );
  });

  test("refuses tampering, other secrets and expired cookies", async () => {
    let now = Date.now();
    const sealer = createCookieSealer(SECRET, "exwave_session", () => now);
    const sealed = await sealer.seal(await session());
    const flipped =
      sealed.slice(0, -3) +
      (sealed.at(-3) === "A" ? "B" : "A") +
      sealed.slice(-2);
    expect(await sealer.unseal(flipped)).toBeNull();
    expect(await sealer.unseal("not-a-jwe")).toBeNull();
    expect(
      await createCookieSealer(
        "another-secret-that-is-32-chars-long",
        "exwave_session",
      ).unseal(sealed),
    ).toBeNull();
    // Keys are bound to the cookie name too.
    expect(await createCookieSealer(SECRET, "other").unseal(sealed)).toBeNull();
    now += (COOKIE_MAX_AGE_SECONDS + 1) * 1000;
    expect(await sealer.unseal(sealed)).toBeNull();
  });

  test("opens cookies sealed with a previous secret during rotation", async () => {
    const old = createCookieSealer(SECRET, "exwave_session");
    const sealed = await old.seal(await session());
    const rotated = createCookieSealer(
      ["a-brand-new-cookie-secret-32-chars", SECRET],
      "exwave_session",
    );
    expect(await rotated.unseal(sealed)).not.toBeNull();
  });

  test("insists on a long secret", () => {
    expect(() => createCookieSealer("short", "exwave_session")).toThrow(
      "32 characters",
    );
    expect(() => createCookieSealer([], "exwave_session")).toThrow();
  });

  test("serializes httpOnly, SameSite=Lax, Secure when asked", () => {
    expect(serializeCookie("n", "v", { secure: true })).toBe(
      `n=v; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}; HttpOnly; SameSite=Lax; Secure`,
    );
    expect(serializeCookie("n", "", { secure: false, maxAge: 0 })).toBe(
      "n=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax",
    );
  });
});
