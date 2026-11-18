import { describe, expect, test } from "bun:test";
import { checkPassword, passwordRules } from "./password";
import type { PasswordPolicy } from "./types";

// Zitadel's default, which new platforms get in production.
const DEFAULT: PasswordPolicy = {
  minLength: 8,
  requiresUppercase: true,
  requiresLowercase: true,
  requiresNumber: true,
  requiresSymbol: true,
};

describe("passwordRules", () => {
  test("lists the rules a policy turns on, in display order", () => {
    expect(passwordRules(DEFAULT)).toEqual([
      "min_length",
      "uppercase",
      "lowercase",
      "number",
      "symbol",
    ]);
    expect(passwordRules({ minLength: 12, requiresNumber: true })).toEqual([
      "min_length",
      "number",
    ]);
    expect(passwordRules({})).toEqual([]);
    expect(passwordRules({ minLength: 0, requiresSymbol: false })).toEqual([]);
  });
});

describe("checkPassword", () => {
  test("names the rule production's first sign-ups broke: the symbol", () => {
    expect(checkPassword("Password123", DEFAULT)).toEqual(["symbol"]);
    expect(checkPassword("Password123!", DEFAULT)).toEqual([]);
  });

  test("names every broken rule, in display order", () => {
    expect(checkPassword("short", DEFAULT)).toEqual([
      "min_length",
      "uppercase",
      "number",
      "symbol",
    ]);
    expect(checkPassword("", DEFAULT)).toEqual(passwordRules(DEFAULT));
  });

  test("only checks the rules the policy turns on", () => {
    expect(checkPassword("abc", {})).toEqual([]);
    expect(checkPassword("abcdefgh", { minLength: 8 })).toEqual([]);
    expect(checkPassword("abcdefg", { minLength: 8 })).toEqual(["min_length"]);
  });

  test("counts code points, as Auth does, not UTF-16 units", () => {
    // Four emoji are eight UTF-16 units but four characters.
    expect(checkPassword("😀😀😀😀", { minLength: 5 })).toEqual(["min_length"]);
    expect(checkPassword("😀😀😀😀a", { minLength: 5 })).toEqual([]);
  });

  test("uses Zitadel's ASCII classes: accents are symbols, not letters", () => {
    expect(
      checkPassword("ÉCOLE", { requiresUppercase: true, requiresSymbol: true }),
    ).toEqual([]);
    expect(checkPassword("école", { requiresLowercase: true })).toEqual([]);
    expect(checkPassword("É", { requiresUppercase: true })).toEqual([
      "uppercase",
    ]);
    expect(checkPassword("pass word", { requiresSymbol: true })).toEqual([]);
  });
});
