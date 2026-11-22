"use client";

import type { PasswordCheck } from "@exwave-nexus/auth/react";
import { RuleMetIcon, RuleOpenIcon } from "@/components/exwave/icons";

/** The platform's password rules, ticked off as the password is typed. */
export function PasswordRules({
  check,
  id,
}: {
  check: PasswordCheck;
  id?: string;
}) {
  if (check.rules.length === 0) return null;
  return (
    <ul id={id} className="rules">
      {check.rules.map(({ rule, ok, label }) => (
        <li key={rule} className={ok ? "met" : undefined}>
          {ok ? <RuleMetIcon /> : <RuleOpenIcon />}
          <span className="rule-label">
            {label}
            <span className="visually-hidden">
              {ok ? " (done)" : " (needed)"}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
