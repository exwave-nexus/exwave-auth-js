import { describe, expect, test } from "bun:test";
import { ExwaveAuthError } from "./errors";
import {
  describeError,
  describeRule,
  describeSignOut,
  describeWeakPassword,
  formatMessage,
} from "./messages";

describe("messages", () => {
  test("names the broken password rules in one sentence", () => {
    const policy = { minLength: 12 };
    expect(describeWeakPassword(["min_length"], { policy })).toBe(
      "Your password needs at least 12 characters.",
    );
    expect(
      describeWeakPassword(["min_length", "number", "symbol"], { policy }),
    ).toBe(
      "Your password needs at least 12 characters, a number (0–9) and a symbol (like ! or #).",
    );
    expect(describeWeakPassword([])).toBe(
      "This password isn't accepted. Choose a stronger one.",
    );
    expect(describeRule("min_length")).toBe("more characters");
  });

  test("describes API errors by code, with the details they carry", () => {
    expect(describeError(new ExwaveAuthError("player_locked", 403))).toBe(
      "This account is locked. Contact support.",
    );
    expect(describeError(new ExwaveAuthError("rate_limited", 429, 600))).toBe(
      "Too many attempts. Try again in 10 min.",
    );
    expect(
      describeError(
        new ExwaveAuthError("weak_password", 422, undefined, ["uppercase"]),
      ),
    ).toBe("Your password needs an uppercase letter (A–Z).");
    expect(describeError(new ExwaveAuthError("teapot", 418))).toBe(
      "Something went wrong (teapot).",
    );
    expect(describeError(new Error("boom"))).toBe(
      "Something went wrong. Try again.",
    );
  });

  test("overrides win, by key, placeholders included", () => {
    const messages = {
      "error.invalid_credentials": "Mauvais identifiants.",
      "rule.min_length": "au moins {count} caractères",
      "error.weak_password": "Il faut {rules}.",
      "error.custom_code": "A code the defaults don't know.",
    };
    expect(
      describeError(new ExwaveAuthError("invalid_credentials", 401), {
        messages,
      }),
    ).toBe("Mauvais identifiants.");
    expect(
      describeWeakPassword(["min_length"], {
        policy: { minLength: 8 },
        messages,
      }),
    ).toBe("Il faut au moins 8 caractères.");
    expect(
      describeError(new ExwaveAuthError("custom_code", 400), { messages }),
    ).toBe("A code the defaults don't know.");
    expect(formatMessage("not.a.key")).toBe("not.a.key");
  });

  test("says why a session ended, with a tone", () => {
    expect(describeSignOut("account_locked")).toEqual({
      text: "This account was locked, so you were signed out. Contact support.",
      tone: "error",
    });
    expect(describeSignOut("signed_out").tone).toBe("ok");
  });
});
