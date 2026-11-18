import type { PasswordPolicy } from "./types";

/** One requirement of a platform's password policy. */
export type PasswordRule =
  | "min_length"
  | "uppercase"
  | "lowercase"
  | "number"
  | "symbol";

/** The rules `policy` turns on, in the order forms list them. */
export function passwordRules(policy: PasswordPolicy): PasswordRule[] {
  const rules: PasswordRule[] = [];
  if (policy.minLength) rules.push("min_length");
  if (policy.requiresUppercase) rules.push("uppercase");
  if (policy.requiresLowercase) rules.push("lowercase");
  if (policy.requiresNumber) rules.push("number");
  if (policy.requiresSymbol) rules.push("symbol");
  return rules;
}

/**
 * The rules of `policy` that `password` breaks; empty when it passes. Checks
 * what Exwave Auth checks before `422 weak_password`: the length in code
 * points, and Zitadel's ASCII classes (a symbol is anything but `A-Za-z0-9`).
 */
export function checkPassword(
  password: string,
  policy: PasswordPolicy,
): PasswordRule[] {
  const met: Record<PasswordRule, boolean> = {
    min_length: [...password].length >= (policy.minLength ?? 0),
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    symbol: /[^A-Za-z0-9]/.test(password),
  };
  return passwordRules(policy).filter((rule) => !met[rule]);
}
