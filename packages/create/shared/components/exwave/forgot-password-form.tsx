"use client";

import { useExwave, usePasswordReset } from "@exwave-nexus/auth/react";
import { type FormEvent, useId, useState } from "react";
import { AuthLink } from "@/components/exwave/auth-link";
import { MockEmailNote } from "@/components/exwave/backend-notice";
import { AlertIcon, MailIcon } from "@/components/exwave/icons";

export function ForgotPasswordForm() {
  const id = useId();
  const { paths } = useExwave();
  const { request } = usePasswordReset();
  const [email, setEmail] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await request.run(email);
  }

  if (request.sent)
    return (
      <div className="auth">
        <section className="card auth-card auth-card-centered">
          <span className="badge-icon">
            <MailIcon size={28} />
          </span>
          <header className="auth-header">
            <h1>Check your email</h1>
            <p>
              If an account uses <strong>{email}</strong>, we sent it a link to
              choose a new password.
            </p>
          </header>
          <MockEmailNote />
        </section>
        <p className="auth-footer">
          <AuthLink href={paths.signIn}>Back to sign in</AuthLink>
        </p>
      </div>
    );

  return (
    <div className="auth">
      <section className="card auth-card">
        <header className="auth-header">
          <h1>Forgot your password?</h1>
          <p>Enter your email and we’ll send you a link to choose a new one.</p>
        </header>
        <form className="form" onSubmit={onSubmit} aria-busy={request.pending}>
          <div className="field">
            <label htmlFor={`${id}-email`}>Email</label>
            <input
              id={`${id}-email`}
              className="input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
          {request.message && (
            <p role="alert" className="notice notice-error">
              <AlertIcon />
              <span>{request.message}</span>
            </p>
          )}
          <button
            type="submit"
            className="button button-primary"
            disabled={request.pending}
          >
            {request.pending ? "Sending…" : "Send the link"}
          </button>
        </form>
      </section>
      <p className="auth-footer">
        Remembered it? <AuthLink href={paths.signIn}>Sign in</AuthLink>
      </p>
    </div>
  );
}
