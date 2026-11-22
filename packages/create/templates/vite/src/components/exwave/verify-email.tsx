"use client";

import { useEmailLink, useExwave } from "@exwave-nexus/auth/react";
import { useEffect } from "react";
import { AuthLink } from "@/components/exwave/auth-link";
import {
  BrokenLinkIcon,
  CheckCircleIcon,
  MailIcon,
  SpinnerIcon,
} from "@/components/exwave/icons";

/** The page verification emails link to: verifies, signs in, then moves on. */
export function VerifyEmail() {
  const { navigate, paths } = useExwave();
  const link = useEmailLink();

  useEffect(() => {
    if (link.status === "verified")
      navigate(paths.afterSignIn, { replace: true });
  }, [link.status, navigate, paths.afterSignIn]);

  if (link.status === "error" || link.status === "none") {
    const failed = link.status === "error";
    return (
      <div className="auth">
        <section className="card auth-card auth-card-centered">
          <span
            className={failed ? "badge-icon badge-icon-error" : "badge-icon"}
          >
            {failed ? <BrokenLinkIcon size={28} /> : <MailIcon size={28} />}
          </span>
          <header className="auth-header">
            <h1>{failed ? "This link doesn’t work" : "Verify your email"}</h1>
            <p role={failed ? "alert" : undefined}>
              {failed
                ? link.message
                : "Open this page from the link in your verification email."}
            </p>
          </header>
          <AuthLink
            href={paths.signIn}
            className="button button-primary button-block"
          >
            Go to sign in
          </AuthLink>
        </section>
      </div>
    );
  }

  const verified = link.status === "verified";
  return (
    <div className="auth">
      <section className="card auth-card auth-card-centered">
        <span className="badge-icon">
          {verified ? <CheckCircleIcon size={28} /> : <SpinnerIcon size={28} />}
        </span>
        <div className="auth-header" role="status">
          <h1>{verified ? "Email verified" : "Verifying your email"}</h1>
          <p>
            {verified
              ? "You’re signed in."
              : "One moment, then we’ll sign you in."}
          </p>
        </div>
      </section>
    </div>
  );
}
