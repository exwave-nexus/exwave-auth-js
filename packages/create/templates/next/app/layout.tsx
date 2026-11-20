import { ExwaveProvider } from "@exwave-nexus/auth/next/client";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { UserButton } from "@/components/exwave/user-button";
import { exwave } from "@/lib/exwave";
import "./globals.css";

export const metadata: Metadata = {
  title: "My app",
  description: "Sign-in with Exwave Auth",
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-svh bg-background font-sans text-foreground antialiased">
        {/* The session as the server sees it: the first render needs no request. */}
        <ExwaveProvider initialState={await exwave.getAuthState()}>
          <header className="border-b">
            <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
              <Link href="/" className="font-semibold">
                My app
              </Link>
              <UserButton />
            </div>
          </header>
          <main className="mx-auto w-full max-w-5xl px-4 py-10">
            {children}
          </main>
        </ExwaveProvider>
      </body>
    </html>
  );
}
