"use client";

import { describeWeakPassword } from "@exwave-nexus/auth/messages";
import {
  useEmailLink,
  useExwave,
  usePasswordCheck,
  usePasswordReset,
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

/** The page password reset emails link to: choose a new password, then sign in. */
export function ResetPasswordForm({
  className,
  ...props
}: ComponentProps<"div">) {
  const id = useId();
  const { navigate, paths, messages } = useExwave();
  const link = useEmailLink();
  const { confirm, policy } = usePasswordReset();
  const [password, setPassword] = useState("");
  const [tried, setTried] = useState(false);
  const check = usePasswordCheck(password, policy);
  const error =
    tried && !check.valid
      ? describeWeakPassword(check.failed, { policy, messages })
      : confirm.message;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTried(true);
    if (link.status !== "reset" || !check.valid) return;
    const session = await confirm.run(
      { userId: link.userId, code: link.code },
      password,
    );
    if (session) navigate(paths.afterSignIn, { replace: true });
  }

  if (link.status === "loading") return null;

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Choose a new password</CardTitle>
          <CardDescription>
            {link.status === "reset" ? (
              "You'll be signed in once it's saved."
            ) : (
              <>
                Open this page from the link in your password reset email.{" "}
                <AuthLink
                  href={paths.forgotPassword}
                  className="underline underline-offset-4"
                >
                  Send a new link
                </AuthLink>
              </>
            )}
          </CardDescription>
        </CardHeader>
        {link.status === "reset" && (
          <CardContent>
            <form onSubmit={onSubmit} aria-busy={confirm.pending}>
              <div className="flex flex-col gap-6">
                <div className="grid gap-2">
                  <Label htmlFor={`${id}-password`}>New password</Label>
                  <Input
                    id={`${id}-password`}
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
                  disabled={confirm.pending}
                >
                  {confirm.pending ? "Saving…" : "Save and sign in"}
                </Button>
              </div>
            </form>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
