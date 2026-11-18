"use client";

import type { PasswordPolicy } from "@exwave/auth";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import {
  type FormState,
  forgotPasswordAction,
  resendAction,
  resetPasswordAction,
  signInAction,
  signOutAction,
  signUpAction,
  verifyEmailAction,
} from "./actions";
import { PasswordField } from "./password-field";

const empty: FormState = {};

export function SignUpForm({ policy }: { policy: PasswordPolicy | null }) {
  const [state, action, pending] = useActionState(signUpAction, empty);
  if (state.done && state.email) return <CheckEmail email={state.email} />;
  return (
    <section className="card">
      <h1>Create an account</h1>
      <form action={action}>
        <label>
          Email
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          Display name
          <input
            name="displayName"
            autoComplete="nickname"
            maxLength={64}
            required
          />
        </label>
        <label>
          Username (optional, lets you sign in without your email)
          <input
            name="username"
            autoComplete="username"
            pattern="[A-Za-z0-9][A-Za-z0-9._\-]{2,31}"
          />
        </label>
        <PasswordField label="Password" policy={policy} />
        {state.error && <p className="error">{state.error}</p>}
        <button type="submit" disabled={pending}>
          Sign up
        </button>
      </form>
      <p className="muted">
        Already have an account? <Link href="/sign-in">Sign in</Link>
      </p>
    </section>
  );
}

export function CheckEmail({
  email,
  unverified = false,
}: {
  email: string;
  /** Signing in found an unverified email: nothing was sent yet. */
  unverified?: boolean;
}) {
  const [state, action, pending] = useActionState(resendAction, empty);
  return (
    <section className="card">
      <h1>{unverified ? "Verify your email first" : "Check your email"}</h1>
      <p>
        {unverified
          ? "Your email isn't verified yet. We can send a new link to "
          : "We sent a verification link to "}
        <strong>{email}</strong>. Open it on this device to finish signing up.
      </p>
      <form action={action} className="row">
        <input type="hidden" name="email" value={email} />
        <button type="submit" className="secondary" disabled={pending}>
          {unverified ? "Send me a link" : "Send it again"}
        </button>
        {state.done && <span className="ok">Sent.</span>}
        {state.error && <span className="error">{state.error}</span>}
      </form>
    </section>
  );
}

/** Runs the verification once on mount: link scanners don't run scripts. */
export function VerifyEmail({
  userId,
  code,
}: {
  userId: string;
  code: string;
}) {
  const router = useRouter();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    verifyEmailAction(userId, code).then((state) => {
      if (state.done) router.replace("/account");
      else setError(state.error ?? "Something went wrong.");
    });
  }, [userId, code, router]);
  if (!error)
    return (
      <section className="card">
        <p>Verifying your email…</p>
      </section>
    );
  return (
    <section className="card">
      <h1>We couldn't verify this link</h1>
      <p className="error">{error}</p>
      <p>
        <Link href="/sign-in">Sign in</Link> to get a new link.
      </p>
    </section>
  );
}

export function SignInForm({
  signedOut,
}: {
  /** Why the last session ended, from `exwave.getSignOutReason()`. */
  signedOut: { text: string; tone: string } | null;
}) {
  const [state, action, pending] = useActionState(signInAction, empty);
  if (state.code === "email_not_verified" && state.email)
    return <CheckEmail email={state.email} unverified />;
  return (
    <section className="card">
      <h1>Sign in</h1>
      {signedOut && (
        <p className={`notice ${signedOut.tone}`} role="status">
          {signedOut.text}
        </p>
      )}
      <form action={action}>
        <label>
          Email or username
          <input name="login" autoComplete="username" required />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </label>
        {state.error && <p className="error">{state.error}</p>}
        <button type="submit" disabled={pending}>
          Sign in
        </button>
      </form>
      <p className="muted">
        <Link href="/forgot-password">Forgot your password?</Link> · No account?{" "}
        <Link href="/sign-up">Sign up</Link>
      </p>
    </section>
  );
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(forgotPasswordAction, empty);
  if (state.done)
    return (
      <section className="card">
        <h1>Check your email</h1>
        <p>
          If an account uses this address, we sent it a link to choose a new
          password.
        </p>
      </section>
    );
  return (
    <section className="card">
      <h1>Forgot your password?</h1>
      <form action={action}>
        <label>
          Email
          <input name="email" type="email" autoComplete="email" required />
        </label>
        {state.error && <p className="error">{state.error}</p>}
        <button type="submit" disabled={pending}>
          Send me a link
        </button>
      </form>
    </section>
  );
}

export function ResetPasswordForm({
  userId,
  code,
  policy,
}: {
  userId: string;
  code: string;
  policy: PasswordPolicy | null;
}) {
  const [state, action, pending] = useActionState(resetPasswordAction, empty);
  return (
    <section className="card">
      <h1>Choose a new password</h1>
      <p className="muted">This signs you out everywhere else.</p>
      <form action={action}>
        <input type="hidden" name="userId" value={userId} />
        <input type="hidden" name="code" value={code} />
        <PasswordField label="New password" policy={policy} />
        {state.error && <p className="error">{state.error}</p>}
        <button type="submit" disabled={pending}>
          Save and sign in
        </button>
      </form>
    </section>
  );
}

export function SignOutButtons() {
  const [state, action, pending] = useActionState(signOutAction, empty);
  return (
    <form action={action} className="card row">
      <button
        type="submit"
        name="everywhere"
        value="false"
        className="secondary"
        disabled={pending}
      >
        Sign out
      </button>
      <button
        type="submit"
        name="everywhere"
        value="true"
        className="danger"
        disabled={pending}
      >
        Sign out everywhere
      </button>
      {state.error && <p className="error">{state.error}</p>}
    </form>
  );
}

function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * The PAT countdown, plus what a game on this page would do: get a PAT from
 * `GET /api/exwave/token` and call an API with it.
 */
export function TokenPanel({ expiresAt }: { expiresAt: number }) {
  const router = useRouter();
  const now = useNow();
  const refreshedFor = useRef(0);
  const [result, setResult] = useState<{ label: string; body: unknown } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  // With a minute left, re-render: the proxy refreshes the session first.
  useEffect(() => {
    if (expiresAt - now < 60_000 && refreshedFor.current !== expiresAt) {
      refreshedFor.current = expiresAt;
      router.refresh();
    }
  }, [now, expiresAt, router]);

  async function getToken(): Promise<string | null> {
    const response = await fetch("/api/exwave/token");
    const body = await response.json();
    if (!response.ok) {
      setResult({ label: `GET /api/exwave/token → ${response.status}`, body });
      return null;
    }
    return body.access_token;
  }

  async function run(task: () => Promise<void>) {
    setBusy(true);
    try {
      await task();
    } finally {
      setBusy(false);
      // GET token may have rotated the cookie: show the new expiry.
      router.refresh();
    }
  }

  return (
    <section className="card">
      <h2>Player access token</h2>
      <p className="countdown">
        {clock(expiresAt - now)}{" "}
        <span className="muted">
          left · the proxy refreshes it with a minute to go
        </span>
      </p>
      <div className="row">
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            run(async () => {
              const response = await fetch("/api/exwave/token");
              setResult({
                label: `GET /api/exwave/token → ${response.status}`,
                body: await response.json(),
              });
            })
          }
        >
          Get a PAT, as a game would
        </button>
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={() =>
            run(async () => {
              const token = await getToken();
              if (!token) return;
              const response = await fetch("/api/protected", {
                headers: { authorization: `Bearer ${token}` },
              });
              setResult({
                label: `GET /api/protected → ${response.status}`,
                body: await response.json(),
              });
            })
          }
        >
          Call protected API
        </button>
      </div>
      {result && (
        <>
          <p className="muted">{result.label}</p>
          <pre>{JSON.stringify(result.body, null, 2)}</pre>
        </>
      )}
    </section>
  );
}
