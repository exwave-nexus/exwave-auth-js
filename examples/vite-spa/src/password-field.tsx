import {
  checkPassword,
  type PasswordPolicy,
  passwordRules,
} from "@exwave-nexus/auth";
import { useExwave } from "@exwave-nexus/auth/react";
import { useEffect, useId, useRef, useState } from "react";
import { describeRule, describeWeakPassword } from "./errors";

/** The platform's password policy from `GET config` (cached 60 s), or `null` until it loads. */
export function usePasswordPolicy(): PasswordPolicy | null {
  const { auth } = useExwave();
  const [policy, setPolicy] = useState<PasswordPolicy | null>(null);
  useEffect(() => {
    let active = true;
    auth.getConfig().then(
      (config) => active && setPolicy(config.passwordPolicy),
      // No policy to show: Auth still checks it on submit.
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [auth]);
  return policy;
}

/**
 * A new-password input that lists the policy's rules, ticks them off as the
 * player types, and blocks the submit (native validation) until all pass.
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
