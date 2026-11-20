"use client";

import { describeWeakPassword } from "@exwave-nexus/auth/messages";
import {
  useExwave,
  usePasswordCheck,
  usePlatformConfig,
  useSignUp,
} from "@exwave-nexus/auth/react";
import { type ComponentProps, type FormEvent, useId, useState } from "react";
import { AuthLink } from "@/components/exwave/auth-link";
import { PasswordRules } from "@/components/exwave/password-rules";
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

export function SignUpForm({ className, ...props }: ComponentProps<"div">) {
  const id = useId();
  const { paths, messages } = useExwave();
  const config = usePlatformConfig();
  const { step, email, policy, signUp, resend, back } = useSignUp();
  const [password, setPassword] = useState("");
  const [tried, setTried] = useState(false);
  const check = usePasswordCheck(password, policy);
  const weak =
    tried && !check.valid
      ? describeWeakPassword(check.failed, { policy, messages })
      : null;
  const error = weak ?? signUp.message;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTried(true);
    if (!check.valid) return;
    const form = new FormData(event.currentTarget);
    await signUp.run({
      displayName: String(form.get("displayName")),
      email: String(form.get("email")),
      password,
    });
  }

  if (config && !config.signUpEnabled)
    return (
      <div className={cn("flex flex-col gap-6", className)} {...props}>
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Sign-up is closed</CardTitle>
            <CardDescription>
              New accounts are by invitation only. Already have one?{" "}
              <AuthLink
                href={paths.signIn}
                className="underline underline-offset-4"
              >
                Sign in
              </AuthLink>
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );

  if (step === "check_email")
    return (
      <div className={cn("flex flex-col gap-6", className)} {...props}>
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Check your email</CardTitle>
            <CardDescription>
              We sent a link to <strong>{email}</strong>. Open it to verify your
              email and sign in.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {resend.message && (
              <p role="alert" className="text-sm text-destructive">
                {resend.message}
              </p>
            )}
            <Button
              variant="outline"
              disabled={resend.pending || resend.sent}
              onClick={() => resend.run()}
            >
              {resend.sent ? "We sent a new link" : "Send the link again"}
            </Button>
            <Button variant="ghost" onClick={back}>
              Use a different email
            </Button>
          </CardContent>
        </Card>
      </div>
    );

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Create an account</CardTitle>
          <CardDescription>
            We&apos;ll email you a link to verify it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} aria-busy={signUp.pending}>
            <div className="flex flex-col gap-6">
              <div className="grid gap-2">
                <Label htmlFor={`${id}-name`}>Name</Label>
                <Input
                  id={`${id}-name`}
                  name="displayName"
                  autoComplete="name"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`${id}-email`}>Email</Label>
                <Input
                  id={`${id}-email`}
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`${id}-password`}>Password</Label>
                <Input
                  id={`${id}-password`}
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={`${id}-rules`}
                  required
                />
                <PasswordRules id={`${id}-rules`} check={check} />
              </div>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <Button
                type="submit"
                className="w-full"
                disabled={signUp.pending}
              >
                {signUp.pending ? "Creating your account…" : "Sign up"}
              </Button>
            </div>
            <p className="mt-4 text-center text-sm">
              Already have an account?{" "}
              <AuthLink
                href={paths.signIn}
                className="underline underline-offset-4"
              >
                Sign in
              </AuthLink>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
