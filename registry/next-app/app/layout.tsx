import "@fontsource-variable/nunito-sans";
import "./globals.css";
import { ExwaveProvider } from "@exwave-nexus/auth-nextjs/client";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ThemeProvider } from "@/components/theme-provider";
import { exwave } from "@/lib/exwave";

export const metadata: Metadata = {
  title: "My app",
  description: "Sign-up and sign-in with Exwave Auth",
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {/* The session as the server sees it: the first render needs no request. */}
          <ExwaveProvider initialState={await exwave.getAuthState()}>
            {children}
          </ExwaveProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
