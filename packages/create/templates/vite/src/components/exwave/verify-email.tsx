"use client";

import { useEmailLink, useExwave } from "@exwave-nexus/auth/react";
import { type ComponentProps, useEffect } from "react";
import { AuthLink } from "@/components/exwave/auth-link";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** The page verification emails link to: verifies, signs in, then moves on. */
export function VerifyEmail({ className, ...props }: ComponentProps<"div">) {
  const { navigate, paths } = useExwave();
  const link = useEmailLink();

  useEffect(() => {
    if (link.status === "verified")
      navigate(paths.afterSignIn, { replace: true });
  }, [link.status, navigate, paths.afterSignIn]);

  const [title, description] =
    link.status === "error"
      ? ["This link didn't work", link.message]
      : link.status === "none"
        ? [
            "Verify your email",
            "Open this page from the link in your verification email.",
          ]
        : link.status === "verified"
          ? ["Email verified", "You're signed in."]
          : ["Verifying your email…", "This only takes a moment."];

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl" role="status">
            {title}
          </CardTitle>
          <CardDescription>
            {description}{" "}
            {(link.status === "error" || link.status === "none") && (
              <AuthLink
                href={paths.signIn}
                className="underline underline-offset-4"
              >
                Go to sign in
              </AuthLink>
            )}
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
