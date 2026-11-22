"use client";

import type { ReactNode } from "react";
import { AuthLink } from "@/components/exwave/auth-link";

/** Around every auth screen: your logo, linking home, above the card. */
export function AuthPage({ children }: { children: ReactNode }) {
  return (
    <main className="auth-page">
      <AuthLink href="/" className="auth-logo" aria-label="Home">
        <img src="/exwave.svg" alt="" width={48} height={48} />
      </AuthLink>
      {children}
    </main>
  );
}
