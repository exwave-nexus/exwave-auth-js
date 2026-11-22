"use client";

import { describeWeakPassword } from "@exwave-nexus/auth/messages";
import {
  useEmailLink,
  useExwave,
  usePasswordCheck,
  usePasswordReset,
} from "@exwave-nexus/auth/react";
import { type FormEvent, useId, useState } from "react";
import { AuthLink } from "@/components/exwave/auth-link";
import { AlertIcon } from "@/components/exwave/icons";
import { PasswordInput } from "@/components/exwave/password-input";
import { PasswordRules } from "@/components/exwave/password-rules";

/** The page password reset emails link to: choose a new password, then sign in. */
export function ResetPasswordForm() {
  const id = useId();
  const { navigate, paths, messages } = useExwave();
  const link = useEmailLink();
  const { confirm, policy } = usePasswordReset();
  const [password, setPassword] = useState("");
  const [tried, setTried] = useState(false);
  const check = usePasswordCheck(password, policy);
  const error =
    tried && !check.valid
      ? describeWeakPassword(check.failed, { policy, messages })
      : confirm.message;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTried(true);
    if (link.status !== "reset" || !check.valid) return;
    const session = await confirm.run(
      { userId: link.userId, code: link.code },
      password,
    );
    if (session) navigate(paths.afterSignIn, { replace: true });
  }

  if (link.status === "loading") return null;

  if (link.status !== "reset")
    return (
      <div className="auth">
        <section className="card auth-card">
          <header className="auth-header">
            <h1>Choose a new password</h1>
            <p>Open this page from the link in your password reset email.</p>
          </header>
          <AuthLink
            href={paths.forgotPassword}
            className="button button-outline button-block"
          >
            Send a new link
          </AuthLink>
        </section>
      </div>
    );

  return (
    <div className="auth">
      <section className="card auth-card">
        <header className="auth-header">
          <h1>Choose a new password</h1>
          <p>You’ll be signed in once it’s saved.</p>
        </header>
        <form className="form" onSubmit={onSubmit} aria-busy={confirm.pending}>
          <div className="field">
            <label htmlFor={`${id}-password`}>New password</label>
            <PasswordInput
              id={`${id}-password`}
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={`${id}-rules`}
              required
            />
            <PasswordRules id={`${id}-rules`} check={check} />
          </div>
          {error && (
            <p role="alert" className="notice notice-error">
              <AlertIcon />
              <span>{error}</span>
            </p>
          )}
          <button
            type="submit"
            className="button button-primary"
            disabled={confirm.pending}
          >
            {confirm.pending ? "Saving…" : "Save and sign in"}
          </button>
        </form>
      </section>
    </div>
  );
}
