import { describe, expect, test } from "bun:test";
import { decodePublishableKey, encodePublishableKey } from "./publishable-key";

const PLATFORM = "6f1c2a10-5a3e-4c2b-9d4e-0a1b2c3d4e5f";
const raw = (text: string) =>
  `exw_pk_${Buffer.from(text).toString("base64url")}`;

describe("publishable keys", () => {
  test("decode what Nexus encodes", () => {
    const key = encodePublishableKey({
      authOrigin: "https://auth-prod.exwave.net",
      platformId: PLATFORM,
    });
    expect(key.startsWith("exw_pk_")).toBe(true);
    expect(key).not.toContain("=");
    expect(decodePublishableKey(key)).toEqual({
      version: 1,
      authOrigin: "https://auth-prod.exwave.net",
      platformId: PLATFORM,
    });
  });

  test("the examples' mock key points at the local mock", () => {
    expect(
      decodePublishableKey(
        "exw_pk_MXxodHRwOi8vbG9jYWxob3N0OjQwMTB8NmYxYzJhMTAtNWEzZS00YzJiLTlkNGUtMGExYjJjM2Q0ZTVm",
      ),
    ).toEqual({
      version: 1,
      authOrigin: "http://localhost:4010",
      platformId: PLATFORM,
    });
  });

  test("accept padding, a trailing slash and an upper-case ID", () => {
    const key = `exw_pk_${Buffer.from(`1|https://auth-prod.exwave.net/|${PLATFORM.toUpperCase()}`).toString("base64")}`;
    expect(decodePublishableKey(key)).toMatchObject({
      authOrigin: "https://auth-prod.exwave.net",
      platformId: PLATFORM,
    });
  });

  for (const [name, key] of [
    [
      "the wrong prefix",
      `exw_sk_${raw(`1|https://a.test|${PLATFORM}`).slice(7)}`,
    ],
    ["another version", raw(`2|https://a.test|${PLATFORM}`)],
    ["extra parts", raw(`1|https://a.test|${PLATFORM}|x`)],
    ["a bad platform ID", raw("1|https://a.test|not-a-uuid")],
    ["plain HTTP off localhost", raw(`1|http://auth-prod.exwave.net|${PLATFORM}`)],
    ["a path in the origin", raw(`1|https://a.test/auth|${PLATFORM}`)],
    ["garbage", "exw_pk_%%%"],
  ] as const)
    test(`reject ${name}`, () => {
      expect(() => decodePublishableKey(key)).toThrow(
        "invalid_publishable_key",
      );
    });
});
