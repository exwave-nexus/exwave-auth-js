import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { exwave } from "@/lib/exwave";
import "./globals.css";

export const metadata: Metadata = { title: "Exwave auth · Next.js" };

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await exwave.getUser();
  return (
    <html lang="en">
      <body>
        <header>
          <strong>Exwave auth · Next.js server</strong>
          <Link href="/">Home</Link>
          {user ? (
            <Link href="/account">{user.displayName}</Link>
          ) : (
            <>
              <Link href="/sign-in">Sign in</Link>
              <Link href="/sign-up">Sign up</Link>
            </>
          )}
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
