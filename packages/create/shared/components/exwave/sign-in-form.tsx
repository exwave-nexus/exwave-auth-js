"use client";

import { describeSignOut } from "@exwave-nexus/auth/messages";
import {
  useExwave,
  useResendVerification,
  useSignIn,
} from "@exwave-nexus/auth-react";
import { type FormEvent, useId } from "react";
import { AuthLink, redirectTarget } from "@/components/exwave/auth-link";
import {
  AlertIcon,
  CheckCircleIcon,
  InfoIcon,
} from "@/components/exwave/icons";

const TONE_ICONS = {
  error: <AlertIcon />,
  info: <InfoIcon />,
  ok: <CheckCircleIcon />,
};

export function SignInForm() {
  const id = useId();
  const { navigate, paths, signOutReason, messages } = useExwave();
  const signIn = useSignIn();
  const resend = useResendVerification(signIn.unverifiedEmail);
  const ended = signOutReason
    ? describeSignOut(signOutReason, { messages })
    : null;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const session = await signIn.run({
      login: String(form.get("login")),
      password: String(form.get("password")),
    });
    if (session) navigate(redirectTarget(paths.afterSignIn), { replace: true });
  }

  return (
    <div className="auth">
      <section className="card auth-card">
        <header className="auth-header">
          <h1>Sign in</h1>
          <p>Welcome back. Use your email or username.</p>
        </header>
        {ended && (
          <p role="status" className={`notice notice-${ended.tone}`}>
            {TONE_ICONS[ended.tone]}
            <span>{ended.text}</span>
          </p>
        )}
        <form className="form" onSubmit={onSubmit} aria-busy={signIn.pending}>
          <div className="field">
            <label htmlFor={`${id}-login`}>Email or username</label>
            <input
              id={`${id}-login`}
              className="input"
              name="login"
              autoComplete="username"
              required
            />
          </div>
          <div className="field">
            <div className="field-row">
              <label htmlFor={`${id}-password`}>Password</label>
              <AuthLink href={paths.forgotPassword}>Forgot password?</AuthLink>
            </div>
            <input
              id={`${id}-password`}
              className="input"
              name="password"
              type="password"
              autoComplete="current-password"
              aria-invalid={signIn.error ? true : undefined}
              aria-describedby={signIn.message ? `${id}-error` : undefined}
              required
            />
          </div>
          {signIn.message && (
            <p id={`${id}-error`} role="alert" className="notice notice-error">
              <AlertIcon />
              <span>{signIn.message}</span>
            </p>
          )}
          {signIn.unverifiedEmail && (
            <button
              type="button"
              className="button button-outline"
              disabled={resend.pending || resend.sent}
              onClick={() => resend.run()}
            >
              {resend.sent
                ? "We sent a new link"
                : "Send a new verification link"}
            </button>
          )}
          <button
            type="submit"
            className="button button-primary"
            disabled={signIn.pending}
          >
            {signIn.pending ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </section>
      <p className="auth-footer">
        New here? <AuthLink href={paths.signUp}>Create an account</AuthLink>
      </p>
    </div>
  );
}
