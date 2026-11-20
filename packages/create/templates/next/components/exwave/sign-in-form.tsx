"use client";

import { describeSignOut } from "@exwave-nexus/auth/messages";
import {
  useExwave,
  useResendVerification,
  useSignIn,
} from "@exwave-nexus/auth/react";
import { type ComponentProps, type FormEvent, useId } from "react";
import { AuthLink, redirectTarget } from "@/components/exwave/auth-link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function SignInForm({ className, ...props }: ComponentProps<"div">) {
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
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Sign in</CardTitle>
          <CardDescription>
            Enter your email or username, and your password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} aria-busy={signIn.pending}>
            <div className="flex flex-col gap-6">
              {ended && (
                <p
                  role="status"
                  className={cn(
                    "rounded-md border px-3 py-2 text-sm",
                    ended.tone === "error" &&
                      "border-destructive/50 text-destructive",
                  )}
                >
                  {ended.text}
                </p>
              )}
              <div className="grid gap-2">
                <Label htmlFor={`${id}-login`}>Email or username</Label>
                <Input
                  id={`${id}-login`}
                  name="login"
                  autoComplete="username"
                  required
                />
              </div>
              <div className="grid gap-2">
                <div className="flex items-center">
                  <Label htmlFor={`${id}-password`}>Password</Label>
                  <AuthLink
                    href={paths.forgotPassword}
                    className="ml-auto text-sm underline-offset-4 hover:underline"
                  >
                    Forgot your password?
                  </AuthLink>
                </div>
                <Input
                  id={`${id}-password`}
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  aria-invalid={signIn.error ? true : undefined}
                  aria-describedby={signIn.message ? `${id}-error` : undefined}
                  required
                />
              </div>
              {signIn.message && (
                <p
                  id={`${id}-error`}
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {signIn.message}
                </p>
              )}
              {signIn.unverifiedEmail && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={resend.pending || resend.sent}
                  onClick={() => resend.run()}
                >
                  {resend.sent
                    ? "We sent a new link"
                    : "Send a new verification link"}
                </Button>
              )}
              <Button
                type="submit"
                className="w-full"
                disabled={signIn.pending}
              >
                {signIn.pending ? "Signing in…" : "Sign in"}
              </Button>
            </div>
            <p className="mt-4 text-center text-sm">
              Don&apos;t have an account?{" "}
              <AuthLink
                href={paths.signUp}
                className="underline underline-offset-4"
              >
                Sign up
              </AuthLink>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
