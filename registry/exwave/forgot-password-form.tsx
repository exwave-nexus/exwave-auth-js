"use client";

import { useExwave, usePasswordReset } from "@exwave-nexus/auth/react";
import { type ComponentProps, type FormEvent, useId, useState } from "react";
import { AuthLink } from "@/components/exwave/auth-link";
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

export function ForgotPasswordForm({
  className,
  ...props
}: ComponentProps<"div">) {
  const id = useId();
  const { paths } = useExwave();
  const { request } = usePasswordReset();
  const [email, setEmail] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await request.run(email);
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">
            {request.sent ? "Check your email" : "Reset your password"}
          </CardTitle>
          <CardDescription>
            {request.sent
              ? `If an account uses ${email}, we sent it a link to choose a new password.`
              : "Enter your email and we'll send you a link to choose a new password."}
          </CardDescription>
        </CardHeader>
        {!request.sent && (
          <CardContent>
            <form onSubmit={onSubmit} aria-busy={request.pending}>
              <div className="flex flex-col gap-6">
                <div className="grid gap-2">
                  <Label htmlFor={`${id}-email`}>Email</Label>
                  <Input
                    id={`${id}-email`}
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                  />
                </div>
                {request.message && (
                  <p role="alert" className="text-sm text-destructive">
                    {request.message}
                  </p>
                )}
                <Button
                  type="submit"
                  className="w-full"
                  disabled={request.pending}
                >
                  {request.pending ? "Sending…" : "Send the link"}
                </Button>
              </div>
              <p className="mt-4 text-center text-sm">
                Remembered it?{" "}
                <AuthLink
                  href={paths.signIn}
                  className="underline underline-offset-4"
                >
                  Sign in
                </AuthLink>
              </p>
            </form>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
