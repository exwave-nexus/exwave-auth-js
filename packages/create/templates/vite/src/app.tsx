import type { ReactNode } from "react";
import { AuthLink } from "@/components/exwave/auth-link";
import { ForgotPasswordForm } from "@/components/exwave/forgot-password-form";
import { ResetPasswordForm } from "@/components/exwave/reset-password-form";
import { SignInForm } from "@/components/exwave/sign-in-form";
import { SignUpForm } from "@/components/exwave/sign-up-form";
import { UserButton } from "@/components/exwave/user-button";
import { VerifyEmail } from "@/components/exwave/verify-email";
import { AccountPage } from "./pages/account";
import { HomePage } from "./pages/home";
import { usePath } from "./router";

const auth = (form: ReactNode) => (
  <div className="mx-auto w-full max-w-sm">{form}</div>
);

const ROUTES: Record<string, () => ReactNode> = {
  "/": () => <HomePage />,
  "/account": () => <AccountPage />,
  "/sign-in": () => auth(<SignInForm />),
  "/sign-up": () => auth(<SignUpForm />),
  "/verify": () => auth(<VerifyEmail />),
  "/forgot-password": () => auth(<ForgotPasswordForm />),
  "/reset-password": () => auth(<ResetPasswordForm />),
};

export function App() {
  const path = usePath();
  const page = ROUTES[path] ?? (() => <p>Page not found.</p>);
  return (
    <>
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <AuthLink href="/" className="font-semibold">
            My app
          </AuthLink>
          <UserButton />
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl px-4 py-10">{page()}</main>
    </>
  );
}
