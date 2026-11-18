import { useExwave } from "@exwave/auth/react";
import { useEffect, useState } from "react";
import { describeError } from "../errors";
import { PasswordField, usePasswordPolicy } from "../password-field";
import { Link, navigate } from "../router";
import { field, secret, useAction } from "../use-action";

export function SignUpPage() {
  const { auth } = useExwave();
  const policy = usePasswordPolicy();
  const [email, setEmail] = useState("");
  const signUp = useAction(async (data) => {
    setEmail(field(data, "email"));
    return auth.signUp({
      email: field(data, "email"),
      displayName: field(data, "displayName"),
      username: field(data, "username") || undefined,
      password: secret(data, "password"),
      redirectTo: `${location.origin}/verify`,
    });
  }, policy);

  if (signUp.done) return <CheckEmail email={email} />;
  return (
    <section className="card">
      <h1>Create an account</h1>
      <form onSubmit={signUp.onSubmit}>
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
        {signUp.message && <p className="error">{signUp.message}</p>}
        <button type="submit" disabled={signUp.pending}>
          Sign up
        </button>
      </form>
      <p className="muted">
        Already have an account? <Link to="/sign-in">Sign in</Link>
      </p>
    </section>
  );
}

/** Shown after sign-up and when signing in with an unverified email. */
export function CheckEmail({
  email,
  unverified = false,
}: {
  email: string;
  /** Signing in found an unverified email: nothing was sent yet. */
  unverified?: boolean;
}) {
  const { auth } = useExwave();
  const resend = useAction(() =>
    auth.resendVerification({ email, redirectTo: `${location.origin}/verify` }),
  );
  return (
    <section className="card">
      <h1>{unverified ? "Verify your email first" : "Check your email"}</h1>
      <p>
        {unverified
          ? "Your email isn't verified yet. We can send a new link to "
          : "We sent a verification link to "}
        <strong>{email}</strong>. Open it on this device to finish signing up.
      </p>
      <form onSubmit={resend.onSubmit} className="row">
        <button type="submit" className="secondary" disabled={resend.pending}>
          {unverified ? "Send me a link" : "Send it again"}
        </button>
        {resend.done && <span className="ok">Sent.</span>}
        {resend.message && <span className="error">{resend.message}</span>}
      </form>
    </section>
  );
}

/** The email link lands here and signs the player in. */
export function VerifyPage() {
  const { auth } = useExwave();
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    auth
      .handleEmailLink()
      .then((link) => {
        if (link?.type === "email_verified")
          navigate("/account", { replace: true });
        else setError(new Error("no link"));
      })
      .catch(setError);
  }, [auth]);

  if (!error)
    return (
      <section className="card">
        <p>Verifying your email…</p>
      </section>
    );
  return (
    <section className="card">
      <h1>We couldn't verify this link</h1>
      <p className="error">{describeError(error)}</p>
      <p>
        <Link to="/sign-in">Sign in</Link> to get a new link.
      </p>
    </section>
  );
}
