import type { ReactNode } from "react";
import { AuthLink } from "@/components/exwave/auth-link";
import { AuthPage } from "@/components/exwave/auth-page";
import { ForgotPasswordForm } from "@/components/exwave/forgot-password-form";
import { ResetPasswordForm } from "@/components/exwave/reset-password-form";
import { SignInForm } from "@/components/exwave/sign-in-form";
import { SignUpForm } from "@/components/exwave/sign-up-form";
import { VerifyEmail } from "@/components/exwave/verify-email";
import { AccountPage } from "./pages/account";
import { HomePage } from "./pages/home";
import { usePath } from "./router";

const ROUTES: Record<string, () => ReactNode> = {
  "/": () => <HomePage />,
  "/account": () => <AccountPage />,
  "/sign-in": () => <SignInForm />,
  "/sign-up": () => <SignUpForm />,
  "/verify": () => <VerifyEmail />,
  "/forgot-password": () => <ForgotPasswordForm />,
  "/reset-password": () => <ResetPasswordForm />,
};

/** The auth screens get the auth frame: the logo above a centered card. */
const AUTH = new Set([
  "/sign-in",
  "/sign-up",
  "/verify",
  "/forgot-password",
  "/reset-password",
]);

export function App() {
  const path = usePath();
  const page = ROUTES[path];
  if (!page)
    return (
      <AuthPage>
        <div className="auth">
          <section className="card auth-card auth-card-centered">
            <header className="auth-header">
              <h1>Page not found</h1>
              <p>There’s nothing at this address.</p>
            </header>
            <AuthLink href="/" className="button button-primary button-block">
              Go home
            </AuthLink>
          </section>
        </div>
      </AuthPage>
    );
  return AUTH.has(path) ? <AuthPage>{page()}</AuthPage> : page();
}
