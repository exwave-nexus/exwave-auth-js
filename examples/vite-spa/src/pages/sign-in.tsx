import { isExwaveAuthError } from "@exwave/auth";
import { useExwave } from "@exwave/auth/react";
import { useState } from "react";
import { describeSignOut } from "../errors";
import { Link, navigate } from "../router";
import { field, secret, useAction } from "../use-action";
import { CheckEmail } from "./sign-up";

export function SignInPage() {
  const { auth, signOutReason } = useExwave();
  // Set when the session ended: here, in another tab, or before a reload.
  const signedOut = signOutReason && describeSignOut(signOutReason);
  const [login, setLogin] = useState("");
  const signIn = useAction(async (data) => {
    setLogin(field(data, "login"));
    await auth.signIn({
      login: field(data, "login"),
      password: secret(data, "password"),
    });
    navigate("/account");
  });
  const unverified =
    isExwaveAuthError(signIn.error) &&
    signIn.error.code === "email_not_verified";

  if (unverified && login.includes("@"))
    return <CheckEmail email={login} unverified />;
  return (
    <section className="card">
      <h1>Sign in</h1>
      {signedOut && (
        <p className={`notice ${signedOut.tone}`} role="status">
          {signedOut.text}
        </p>
      )}
      <form onSubmit={signIn.onSubmit}>
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
        {signIn.message && <p className="error">{signIn.message}</p>}
        <button type="submit" disabled={signIn.pending}>
          Sign in
        </button>
      </form>
      <p className="muted">
        <Link to="/forgot-password">Forgot your password?</Link> · No account?{" "}
        <Link to="/sign-up">Sign up</Link>
      </p>
    </section>
  );
}
