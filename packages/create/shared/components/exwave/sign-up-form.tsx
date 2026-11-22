"use client";

import { describeWeakPassword } from "@exwave-nexus/auth/messages";
import {
  useExwave,
  usePasswordCheck,
  usePlatformConfig,
  useSignUp,
} from "@exwave-nexus/auth-react";
import { type FormEvent, useId, useState } from "react";
import { AuthLink } from "@/components/exwave/auth-link";
import { MockEmailNote } from "@/components/exwave/backend-notice";
import { AlertIcon, MailIcon } from "@/components/exwave/icons";
import { PasswordInput } from "@/components/exwave/password-input";
import { PasswordRules } from "@/components/exwave/password-rules";

export function SignUpForm() {
  const id = useId();
  const { paths, messages } = useExwave();
  const config = usePlatformConfig();
  const { step, email, policy, signUp, resend, back } = useSignUp();
  const [password, setPassword] = useState("");
  const [tried, setTried] = useState(false);
  const check = usePasswordCheck(password, policy);
  const weak =
    tried && !check.valid
      ? describeWeakPassword(check.failed, { policy, messages })
      : null;
  const error = weak ?? signUp.message;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTried(true);
    if (!check.valid) return;
    const form = new FormData(event.currentTarget);
    await signUp.run({
      displayName: String(form.get("displayName")),
      email: String(form.get("email")),
      password,
    });
  }

  if (config && !config.signUpEnabled)
    return (
      <div className="auth">
        <section className="card auth-card">
          <header className="auth-header">
            <h1>Sign-up is closed</h1>
            <p>New accounts are by invitation only.</p>
          </header>
        </section>
        <p className="auth-footer">
          Already have an account?{" "}
          <AuthLink href={paths.signIn}>Sign in</AuthLink>
        </p>
      </div>
    );

  if (step === "check_email")
    return (
      <div className="auth">
        <section className="card auth-card auth-card-centered">
          <span className="badge-icon">
            <MailIcon size={28} />
          </span>
          <header className="auth-header">
            <h1>Check your email</h1>
            <p>
              We sent a link to <strong>{email}</strong>. Open it to verify your
              email and sign in.
            </p>
          </header>
          {resend.message && (
            <p role="alert" className="notice notice-error">
              <AlertIcon />
              <span>{resend.message}</span>
            </p>
          )}
          <div className="auth-actions">
            <button
              type="button"
              className="button button-outline"
              disabled={resend.pending || resend.sent}
              onClick={() => resend.run()}
            >
              {resend.sent ? "We sent a new link" : "Send the link again"}
            </button>
            <button
              type="button"
              className="button button-ghost"
              onClick={back}
            >
              Use a different email
            </button>
          </div>
          <MockEmailNote />
        </section>
      </div>
    );

  return (
    <div className="auth">
      <section className="card auth-card">
        <header className="auth-header">
          <h1>Create an account</h1>
          <p>We’ll email you a link to verify it.</p>
        </header>
        <form className="form" onSubmit={onSubmit} aria-busy={signUp.pending}>
          <div className="field">
            <label htmlFor={`${id}-name`}>Name</label>
            <input
              id={`${id}-name`}
              className="input"
              name="displayName"
              autoComplete="name"
              required
            />
          </div>
          <div className="field">
            <label htmlFor={`${id}-email`}>Email</label>
            <input
              id={`${id}-email`}
              className="input"
              name="email"
              type="email"
              autoComplete="email"
              required
            />
          </div>
          <div className="field">
            <label htmlFor={`${id}-password`}>Password</label>
            <PasswordInput
              id={`${id}-password`}
              name="password"
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
            disabled={signUp.pending}
          >
            {signUp.pending ? "Creating your account…" : "Create account"}
          </button>
        </form>
      </section>
      <p className="auth-footer">
        Already have an account?{" "}
        <AuthLink href={paths.signIn}>Sign in</AuthLink>
      </p>
    </div>
  );
}
