import type { EmailLink } from "@exwave-nexus/auth";
import { useExwave } from "@exwave-nexus/auth/react";
import { useEffect, useState } from "react";
import { PasswordField, usePasswordPolicy } from "../password-field";
import { Link, navigate } from "../router";
import { field, secret, useAction } from "../use-action";

export function ForgotPasswordPage() {
  const { auth } = useExwave();
  const reset = useAction((data) =>
    auth.resetPassword({
      email: field(data, "email"),
      redirectTo: `${location.origin}/reset-password`,
    }),
  );
  if (reset.done)
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
      <form onSubmit={reset.onSubmit}>
        <label>
          Email
          <input name="email" type="email" autoComplete="email" required />
        </label>
        {reset.message && <p className="error">{reset.message}</p>}
        <button type="submit" disabled={reset.pending}>
          Send me a link
        </button>
      </form>
    </section>
  );
}

/** The reset link lands here: choose a new password, then you're signed in. */
export function ResetPasswordPage() {
  const { auth } = useExwave();
  const policy = usePasswordPolicy();
  const [link, setLink] = useState<EmailLink | null | undefined>(undefined);
  useEffect(() => {
    auth.handleEmailLink().then(setLink, () => setLink(null));
  }, [auth]);
  const confirm = useAction(async (data) => {
    if (link?.type !== "password_reset") return;
    await auth.confirmPasswordReset({
      userId: link.userId,
      code: link.code,
      password: secret(data, "password"),
    });
    navigate("/account", { replace: true });
  }, policy);

  if (link === undefined) return null;
  if (link?.type !== "password_reset")
    return (
      <section className="card">
        <h1>This link doesn't work</h1>
        <p>
          <Link to="/forgot-password">Ask for a new one</Link>.
        </p>
      </section>
    );
  return (
    <section className="card">
      <h1>Choose a new password</h1>
      <p className="muted">This signs you out everywhere else.</p>
      <form onSubmit={confirm.onSubmit}>
        <PasswordField label="New password" policy={policy} />
        {confirm.message && <p className="error">{confirm.message}</p>}
        <button type="submit" disabled={confirm.pending}>
          Save and sign in
        </button>
      </form>
    </section>
  );
}
