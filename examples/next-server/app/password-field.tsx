"use client";

import {
  checkPassword,
  type PasswordPolicy,
  passwordRules,
} from "@exwave-nexus/auth";
import { useEffect, useId, useRef, useState } from "react";
import { describeRule, describeWeakPassword } from "@/lib/errors";

/**
 * A new-password input that lists the policy's rules (from `GET config`, read
 * by the page on the server), ticks them off as the player types, and blocks
 * the submit (native validation) until all pass.
 */
export function PasswordField({
  label,
  policy,
}: {
  label: string;
  policy: PasswordPolicy | null;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const rules = policy ? passwordRules(policy) : [];
  const failed = policy ? checkPassword(value, policy) : [];
  const problem =
    value && failed.length ? describeWeakPassword(failed, policy) : "";

  useEffect(() => {
    input.current?.setCustomValidity(problem);
  }, [problem]);

  // React resets the form after each Server Function: start the list over.
  useEffect(() => {
    const form = input.current?.form;
    const onReset = () => setValue("");
    form?.addEventListener("reset", onReset);
    return () => form?.removeEventListener("reset", onReset);
  }, []);

  return (
    <>
      <label>
        {label}
        <input
          ref={input}
          name="password"
          type="password"
          autoComplete="new-password"
          aria-describedby={rules.length ? id : undefined}
          onChange={(event) => setValue(event.target.value)}
          required
        />
      </label>
      {rules.length > 0 && (
        <ul id={id} className="rules">
          {rules.map((rule) => {
            const ok = !failed.includes(rule);
            const text = describeRule(rule, policy);
            return (
              <li key={rule} className={ok ? "ok" : undefined}>
                {ok ? "✓" : "○"} {text[0]?.toUpperCase()}
                {text.slice(1)}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
