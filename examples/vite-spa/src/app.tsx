import { useExwave } from "@exwave-nexus/auth/react";
import type { ReactNode } from "react";
import { AccountPage } from "./pages/account";
import { ForgotPasswordPage, ResetPasswordPage } from "./pages/password";
import { SignInPage } from "./pages/sign-in";
import { SignUpPage, VerifyPage } from "./pages/sign-up";
import { Link, usePath } from "./router";

const pages: Record<string, () => ReactNode> = {
  "/": HomePage,
  "/sign-up": SignUpPage,
  "/verify": VerifyPage,
  "/sign-in": SignInPage,
  "/forgot-password": ForgotPasswordPage,
  "/reset-password": ResetPasswordPage,
  "/account": AccountPage,
};

export function App() {
  const path = usePath();
  const { isLoaded, user } = useExwave();
  const Page = pages[path] ?? NotFound;
  return (
    <>
      <header>
        <strong>Exwave auth · Vite SPA</strong>
        <Link to="/">Home</Link>
        {user ? (
          <Link to="/account">{user.displayName}</Link>
        ) : (
          <>
            <Link to="/sign-in">Sign in</Link>
            <Link to="/sign-up">Sign up</Link>
          </>
        )}
      </header>
      <main>{isLoaded ? <Page /> : <p className="muted">Loading…</p>}</main>
    </>
  );
}

function HomePage() {
  const { user } = useExwave();
  return (
    <section className="card">
      <h1>Exwave Auth, browser only</h1>
      <p>
        This app calls the Exwave Auth API from the browser. The access token
        stays in memory; the refresh token sits in <code>localStorage</code>.
      </p>
      {user ? (
        <p>
          Signed in as <strong>{user.displayName}</strong>.{" "}
          <Link to="/account">Open your account</Link>.
        </p>
      ) : (
        <p className="row">
          <Link to="/sign-in">Sign in</Link>
          <Link to="/sign-up">Create an account</Link>
        </p>
      )}
    </section>
  );
}

function NotFound() {
  return (
    <section className="card">
      <h1>Not found</h1>
      <Link to="/">Back home</Link>
    </section>
  );
}
